import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from 'obsidian';
import type { Vault } from 'obsidian';
import axios from 'axios';
import md5 from 'blueimp-md5';

/** 与 sync-server /files 及本地 .sync_meta.json 一致 */
interface SyncFileMeta {
  hash: string;
  updated_at: number;
  deleted?: boolean;
}

type SyncMetaMap = Record<string, SyncFileMeta>;

const SYNC_META_FILENAME = '.sync_meta.json';

async function ensureVaultFoldersForPath(vault: Vault, filePath: string): Promise<void> {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return;
  const folderPath = normalized.slice(0, lastSlash);
  const segments = folderPath.split('/').filter(Boolean);
  let acc = '';
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg;
    const existing = vault.getAbstractFileByPath(acc);
    if (!existing) {
      await vault.createFolder(acc);
    }
  }
}

function normalizeVaultPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** 不参与同步的路径（隐藏项、配置目录、同步元数据） */
function shouldSync(filePath: string): boolean {
  if (!filePath) return false;
  const p = normalizeVaultPath(filePath);
  if (p.startsWith('.')) return false;
  if (p.includes('.obsidian')) return false;
  if (p === SYNC_META_FILENAME || p.endsWith(`/${SYNC_META_FILENAME}`)) return false;
  return true;
}

/** 规范化 map 时跳过的键（非 vault 路径名） */
const REMOTE_PATH_KEY_BLOCKLIST = new Set([
  'schemaVersion',
  'version',
  'files',
  'data',
  'success',
  'code',
  'message',
  'list',
  'items',
  'records',
  'result',
]);

/** 从 /files 根对象扫平为 map 时忽略的包装字段 */
const REMOTE_ROOT_IGNORE = new Set([
  'schemaVersion',
  'version',
  'success',
  'code',
  'message',
  'files',
  'data',
  'list',
  'items',
  'records',
  'result',
]);

function isPlainObjectRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function normalizeRemoteMap(raw: SyncMetaMap): SyncMetaMap {
  const out: SyncMetaMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (REMOTE_PATH_KEY_BLOCKLIST.has(k)) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const path = normalizeVaultPath(k);
    if (!shouldSync(path)) continue;
    const hash = typeof v.hash === 'string' ? v.hash : '';
    out[path] = {
      hash,
      updated_at: typeof v.updated_at === 'number' ? v.updated_at : Date.now(),
      deleted: v.deleted === true,
    };
  }
  return out;
}

/**
 * 仅从 path→metadata 的 map 构建远端表（不支持数组列表）。
 * - 若存在 files 且为对象：用 files 作为文件 map（忽略同层的 schemaVersion 等）。
 * - 若 files 为 JSON 字符串：parse 后为对象则使用。
 * - 若 files 为数组或其它：忽略 files，改用顶层除保留键外的字段作为 map。
 */
function extractRemoteFilesMapPayload(parsed: unknown): SyncMetaMap {
  if (!isPlainObjectRecord(parsed)) return {};

  const filesVal = parsed.files;
  if (isPlainObjectRecord(filesVal)) {
    return filesVal as SyncMetaMap;
  }
  if (typeof filesVal === 'string') {
    const s = filesVal.trim();
    if (s) {
      try {
        const inner = JSON.parse(s) as unknown;
        if (isPlainObjectRecord(inner)) return inner as SyncMetaMap;
      } catch {
        /* ignore */
      }
    }
  }

  const dataVal = parsed.data;
  if (isPlainObjectRecord(dataVal)) {
    return dataVal as SyncMetaMap;
  }

  const out: SyncMetaMap = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (REMOTE_ROOT_IGNORE.has(k)) continue;
    out[k] = v as SyncFileMeta;
  }
  return out;
}

interface SyncPluginSettings {
  serverUrl: string;
}

const DEFAULT_SETTINGS: SyncPluginSettings = {
  serverUrl: 'http://localhost:3000',
};

class VaultSyncSettingTab extends PluginSettingTab {
  plugin: ObsidianSyncPlugin;

  constructor(app: App, plugin: ObsidianSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Vault Sync' });

    new Setting(containerEl)
      .setName('同步服务器地址')
      .setDesc(
        'sync-server 根 URL，无末尾斜杠。需实现 GET /files、POST /upload、GET /download、POST /delete（JSON）。',
      )
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:3000')
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim() || DEFAULT_SETTINGS.serverUrl;
            await this.plugin.saveSettings();
          }),
      );
  }
}

export default class ObsidianSyncPlugin extends Plugin {
  settings: SyncPluginSettings = DEFAULT_SETTINGS;
  private syncRunning = false;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new VaultSyncSettingTab(this.app, this));

    this.addCommand({
      id: 'sync-now',
      name: 'Sync now',
      callback: () => {
        void this.syncNow();
      },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (typeof this.settings.serverUrl !== 'string' || !this.settings.serverUrl.trim()) {
      this.settings.serverUrl = DEFAULT_SETTINGS.serverUrl;
    } else {
      this.settings.serverUrl = this.settings.serverUrl.trim().replace(/\/+$/, '');
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  get baseUrl(): string {
    return this.settings.serverUrl.trim().replace(/\/+$/, '');
  }

  async loadMeta(): Promise<SyncMetaMap> {
    try {
      const content = await this.app.vault.adapter.read(SYNC_META_FILENAME);
      const parsed = JSON.parse(content || '{}') as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as SyncMetaMap;
      }
    } catch {
      /* 首次或损坏 */
    }
    return {};
  }

  async saveMeta(meta: SyncMetaMap): Promise<void> {
    await this.app.vault.adapter.write(SYNC_META_FILENAME, JSON.stringify(meta, null, 2));
  }

  /** 本地待同步路径（已 shouldSync 过滤） */
  listLocalFiles(): string[] {
    return this.app.vault
      .getMarkdownFiles()
      .map((f) => normalizeVaultPath(f.path))
      .filter(shouldSync);
  }

  /** GET /files → path→meta 映射（仅 map；解析一次后 normalize，不再覆盖） */
  async fetchRemoteFiles(): Promise<SyncMetaMap> {
    const res = await axios.get(this.baseUrl + '/files', { responseType: 'text' });
    const raw = res.data as unknown;

    console.log('RAW /files response:', raw);

    let data: unknown = raw;
    if (typeof data === 'string') {
      const s = data.trim();
      if (s === '') {
        data = {};
      } else {
        try {
          data = JSON.parse(s) as unknown;
        } catch (e) {
          console.error('JSON parse failed', e);
          data = {};
        }
      }
    }

    if (Array.isArray(data)) {
      console.error(
        '/files 期望 path→metadata 的对象；收到数组已忽略（请服务端改为 map 或包在 files 对象内）',
      );
      const empty: SyncMetaMap = {};
      console.log('remoteFiles map:', empty);
      return empty;
    }

    const payload = extractRemoteFilesMapPayload(data);
    const remoteFiles = normalizeRemoteMap(payload);

    console.log('remoteFiles map:', remoteFiles);
    return remoteFiles;
  }

  async uploadFile(filePath: string, meta: SyncMetaMap): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    try {
      const content = await this.app.vault.adapter.read(normalized);
      const hash = md5(content || '');

      console.log('upload:', normalized, (content || '').length, hash);

      const updated_at = Date.now();
      await axios.post(this.baseUrl + '/upload', {
        path: normalized,
        content: content || '',
        hash,
        updated_at,
      });

      meta[normalized] = {
        hash,
        updated_at,
        deleted: false,
      };
    } catch (err) {
      console.error('upload failed:', normalized, err);
      throw err;
    }
  }

  async downloadFile(filePath: string, meta: SyncMetaMap): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    try {
      const res = await axios.get(this.baseUrl + '/download', {
        params: { path: normalized },
        responseType: 'text',
      });

      const content = res.data || '';

      const exists = this.app.vault.getAbstractFileByPath(normalized);

      if (exists) {
        await this.app.vault.adapter.write(normalized, content);
      } else {
        await ensureVaultFoldersForPath(this.app.vault, normalized);
        await this.app.vault.create(normalized, content);
      }

      const hash = md5(content);
      const updated_at = Date.now();
      meta[normalized] = {
        hash,
        updated_at,
        deleted: false,
      };

      console.log('download:', normalized, content.length, hash);
    } catch (err) {
      console.error('download failed:', normalized, err);
      throw err;
    }
  }

  async postDeleteRemote(filePath: string): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    await axios.post(this.baseUrl + '/delete', {
      path: normalized,
    });
  }

  async deleteLocalFile(path: string): Promise<void> {
    const normalized = normalizeVaultPath(path);
    const f = this.app.vault.getAbstractFileByPath(normalized);
    if (f instanceof TFile) {
      await this.app.vault.delete(f);
    }
  }

  async syncNow() {
    if (this.syncRunning) {
      new Notice('同步已在进行中');
      return;
    }
    this.syncRunning = true;

    try {
      const server = this.baseUrl;
      if (!server) {
        new Notice('请先在设置中填写同步服务器地址');
        return;
      }

      new Notice('正在同步…');

      const meta = await this.loadMeta();
      for (const k of Object.keys(meta)) {
        if (!shouldSync(k)) delete meta[k];
      }

      let remote: SyncMetaMap;
      try {
        remote = await this.fetchRemoteFiles();
      } catch {
        new Notice('同步中止：无法拉取远端 /files');
        return;
      }

      const localPaths = this.listLocalFiles();
      const pathSet = new Set<string>();
      for (const p of localPaths) {
        if (shouldSync(p)) pathSet.add(normalizeVaultPath(p));
      }
      for (const k of Object.keys(meta)) {
        if (shouldSync(k)) pathSet.add(normalizeVaultPath(k));
      }
      for (const k of Object.keys(remote)) {
        if (shouldSync(k)) pathSet.add(normalizeVaultPath(k));
      }

      const sortedPaths = [...pathSet].sort();

      for (const path of sortedPaths) {
        const abstract = this.app.vault.getAbstractFileByPath(path);
        const localExists = abstract instanceof TFile;
        let localHash: string | null = null;
        if (localExists) {
          try {
            const content = await this.app.vault.adapter.read(path);
            localHash = md5(content || '');
          } catch {
            localHash = null;
          }
        }

        const r = remote[path];
        const remoteDeleted = r?.deleted === true;

        try {
          if (remoteDeleted) {
            if (localExists) {
              console.log('sync decision:', path, 'delete_local', 'REMOTE_DELETED');
              await this.deleteLocalFile(path);
            }
            delete meta[path];
            continue;
          }

          if (!localExists && meta[path]) {
            if (meta[path].deleted) {
              delete meta[path];
              continue;
            }
            console.log('sync decision:', path, 'post_delete_remote', 'LOCAL_DELETED');
            await this.postDeleteRemote(path);
            delete meta[path];
            continue;
          }

          if (localExists) {
            if (localHash === null) {
              console.log('sync decision:', path, 'noop', 'read_failed');
              continue;
            }
            console.log('compare:', {
              filePath: path,
              localHash,
              remoteHash: r?.hash,
            });

            if (!r) {
              console.log('sync decision:', path, 'upload', 'LOCAL_NEW');
              await this.uploadFile(path, meta);
              continue;
            }

            const remoteHashStr =
              typeof r.hash === 'string' ? r.hash : String(r.hash ?? '');
            if (remoteHashStr !== localHash) {
              console.log('sync decision:', path, 'upload', 'LOCAL_MODIFIED');
              await this.uploadFile(path, meta);
              continue;
            }

            console.log('sync decision:', path, 'noop', 'SYNCED');
            meta[path] = {
              hash: localHash,
              updated_at: typeof r.updated_at === 'number' ? r.updated_at : Date.now(),
              deleted: false,
            };
            continue;
          }

          if (r) {
            console.log('sync decision:', path, 'download', 'REMOTE_NEW');
            await this.downloadFile(path, meta);
            continue;
          }
        } catch (e) {
          console.error('sync step failed:', path, e);
        }
      }

      await this.saveMeta(meta);
      new Notice('同步完成');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice('同步失败：' + msg);
    } finally {
      this.syncRunning = false;
    }
  }
}
