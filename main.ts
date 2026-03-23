import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from 'obsidian';
import type { Vault } from 'obsidian';
import axios, { isAxiosError } from 'axios';
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

/**
 * 绝不能当作 vault 路径的键：API 包装字段 + 单文件 metadata 字段名
 * （避免把 { hash, updated_at } 误当成 path→meta 或把 meta 字段当文件名）
 */
const REMOTE_MAP_KEY_DENYLIST = new Set([
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
  'payload',
  'hash',
  'updated_at',
  'deleted',
  'md5',
  'etag',
  'updatedAt',
  'mtime',
  'size',
]);

/** 仅含这些键的普通对象视为「一条文件的 metadata」，不是 path→meta 表 */
const REMOTE_FILE_META_FIELD_KEYS = new Set([
  'hash',
  'updated_at',
  'deleted',
  'md5',
  'etag',
  'updatedAt',
  'mtime',
  'size',
]);

function isPlainObjectRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** 常见 API 包装：{ data|result|payload: {...} } 或 body 为 JSON 字符串 */
function peelRemoteFilesWrapperOnce(o: Record<string, unknown>): Record<string, unknown> {
  const d = o.data ?? o.payload;
  if (isPlainObjectRecord(d)) return d;
  const r = o.result;
  if (isPlainObjectRecord(r)) return r;
  if (typeof o.body === 'string') {
    const s = o.body.trim();
    if (s) {
      try {
        const b = JSON.parse(s) as unknown;
        if (isPlainObjectRecord(b)) return b;
      } catch {
        /* ignore */
      }
    }
  }
  return o;
}

function peelRemoteFilesWrapperDeep(o: Record<string, unknown>): Record<string, unknown> {
  let cur = o;
  for (let i = 0; i < 6; i++) {
    const next = peelRemoteFilesWrapperOnce(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

function isLikelySingleFileMetaRecord(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o);
  if (keys.length === 0) return false;
  return keys.every((k) => REMOTE_FILE_META_FIELD_KEYS.has(k));
}

/**
 * 展开 .files 仅当内层仍是「路径→meta」表。
 * 若 files 内已是 { hash, updated_at } 则禁止下钻，否则会误把 meta 字段当路径名。
 */
function diveIntoFilesMap(obj: Record<string, unknown>): Record<string, unknown> {
  let cur = obj;
  for (let i = 0; i < 12; i++) {
    const inner = cur.files;
    if (!isPlainObjectRecord(inner)) break;
    if (isLikelySingleFileMetaRecord(inner)) break;
    cur = inner;
  }
  return cur;
}

function normalizeRemoteMap(raw: SyncMetaMap): SyncMetaMap {
  const out: SyncMetaMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (REMOTE_MAP_KEY_DENYLIST.has(k)) continue;
    const path = normalizeVaultPath(k);
    if (!shouldSync(path)) continue;

    if (v === null || v === undefined) continue;

    if (typeof v === 'string' || typeof v === 'number') {
      out[path] = {
        hash: String(v),
        updated_at: Date.now(),
        deleted: false,
      };
      continue;
    }

    if (typeof v !== 'object' || Array.isArray(v)) continue;

    const rec = v as unknown as Record<string, unknown>;
    const hashRaw = rec.hash ?? rec.md5 ?? rec.etag;
    const hash =
      typeof hashRaw === 'string'
        ? hashRaw
        : hashRaw != null
          ? String(hashRaw)
          : '';
    const updatedRaw = rec.updated_at ?? rec.updatedAt ?? rec.mtime;
    const updated_at =
      typeof updatedRaw === 'number'
        ? updatedRaw
        : typeof updatedRaw === 'string' && updatedRaw.trim() !== ''
          ? Number(updatedRaw)
          : NaN;
    out[path] = {
      hash,
      updated_at: Number.isFinite(updated_at) ? updated_at : Date.now(),
      deleted: rec.deleted === true,
    };
  }
  return out;
}

/**
 * /files 解析为 path→meta：先剥 API 包装，再展开 .files，最后去掉根级元数据键。
 * 不支持顶层数组。
 */
function extractRemoteFilesMapPayload(parsed: unknown): SyncMetaMap {
  if (!isPlainObjectRecord(parsed)) return {};

  let cur = peelRemoteFilesWrapperDeep(parsed);

  const filesVal = cur.files;
  if (typeof filesVal === 'string') {
    const s = filesVal.trim();
    if (s) {
      try {
        const inner = JSON.parse(s) as unknown;
        if (isPlainObjectRecord(inner)) cur = inner;
      } catch {
        /* ignore */
      }
    }
  }

  cur = diveIntoFilesMap(cur);

  if (isLikelySingleFileMetaRecord(cur)) {
    console.error(
      '/files 解析后为单条 metadata 对象（无路径键），期望 path→meta；请检查是否多剥了一层或 files 内误放 meta',
    );
    return {};
  }

  const out: SyncMetaMap = {};
  for (const [k, v] of Object.entries(cur)) {
    if (REMOTE_MAP_KEY_DENYLIST.has(k)) continue;
    out[k] = v as SyncFileMeta;
  }
  return out;
}

/** 内置默认 sync-server，用户未填写或清空时使用 */
const BUILTIN_DEFAULT_SERVER_URL = 'http://120.77.77.185:3000';

interface SyncPluginSettings {
  serverUrl: string;
  /** 关闭时不执行同步（命令与手动同步均不跑） */
  enableSync: boolean;
}

const DEFAULT_SETTINGS: SyncPluginSettings = {
  serverUrl: BUILTIN_DEFAULT_SERVER_URL,
  enableSync: true,
};

function formatSyncError(err: unknown): string {
  if (isAxiosError(err)) {
    const parts: string[] = [];
    if (err.code) parts.push(err.code);
    if (err.response?.status) parts.push(`HTTP ${err.response.status}`);
    if (err.message) parts.push(err.message);
    return parts.length > 0 ? parts.join(' · ') : '网络请求失败';
  }
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

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
      .setName('Enable Sync')
      .setDesc('关闭时不执行同步；开启后可使用下方「手动同步」或命令面板中的 Sync now。')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableSync).onChange(async (value) => {
          this.plugin.settings.enableSync = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName('Manual Sync').setDesc('立即执行一次同步（不依赖自动触发）。').addButton((btn) =>
      btn.setButtonText('Sync now').onClick(() => {
        void this.plugin.syncNow();
      }),
    );

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc(
        `可选。留空则使用内置地址 ${BUILTIN_DEFAULT_SERVER_URL}。需 sync-server 根 URL（无末尾斜杠）。`,
      )
      .addText((text) =>
        text
          .setPlaceholder(BUILTIN_DEFAULT_SERVER_URL)
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim() || BUILTIN_DEFAULT_SERVER_URL;
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
    if (typeof this.settings.enableSync !== 'boolean') {
      this.settings.enableSync = DEFAULT_SETTINGS.enableSync;
    }
    if (typeof this.settings.serverUrl !== 'string' || !this.settings.serverUrl.trim()) {
      this.settings.serverUrl = BUILTIN_DEFAULT_SERVER_URL;
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
    const pk = Object.keys(payload);
    console.log('/files extract:', { keyCount: pk.length, sampleKeys: pk.slice(0, 12) });

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

  /** 将远端内容写入 `原名.conflict.md`，不覆盖本地正文 */
  async writeConflictFromRemote(filePath: string): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    const res = await axios.get(this.baseUrl + '/download', {
      params: { path: normalized },
      responseType: 'text',
    });
    const content = res.data || '';
    const withoutMd = normalized.replace(/\.md$/i, '');
    const conflictPath = `${withoutMd}.conflict.md`;
    await ensureVaultFoldersForPath(this.app.vault, conflictPath);
    const exists = this.app.vault.getAbstractFileByPath(conflictPath);
    if (exists) {
      await this.app.vault.adapter.write(conflictPath, content);
    } else {
      await this.app.vault.create(conflictPath, content);
    }
    console.log('sync decision:', normalized, 'conflict', 'WROTE_CONFLICT_COPY', conflictPath);
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
      if (!this.settings.enableSync) {
        new Notice('❌ Sync Failed：同步已关闭，请先在设置中开启 Enable Sync');
        return;
      }

      const server = this.baseUrl;
      if (!server) {
        new Notice('❌ Sync Failed：无效的服务器地址');
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
      } catch (err) {
        const detail = formatSyncError(err);
        new Notice(
          `❌ Sync Failed：无法连接服务器或拉取 /files（${server}）。${detail}`,
          8000,
        );
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
      const stepErrors: string[] = [];

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
              // 无 baseline：本地新建或从未记入 meta，远端仅剩删除墓碑 → 应上传，勿误删本地
              if (!meta[path]) {
                console.log('sync decision:', path, 'upload', 'LOCAL_NEW_REMOTE_TOMBSTONE');
                await this.uploadFile(path, meta);
                continue;
              }
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
              const baseRaw = meta[path]?.hash;
              const baseStr =
                typeof baseRaw === 'string' ? baseRaw : baseRaw != null ? String(baseRaw) : '';
              const hasBase = baseStr.length > 0;

              if (hasBase && baseStr !== localHash && baseStr !== remoteHashStr) {
                console.log('sync decision:', path, 'conflict', 'BOTH_MODIFIED');
                await this.writeConflictFromRemote(path);
                continue;
              }
              if (hasBase && baseStr === localHash) {
                console.log('sync decision:', path, 'download', 'REMOTE_MODIFIED');
                await this.downloadFile(path, meta);
                continue;
              }
              if (hasBase && baseStr === remoteHashStr) {
                console.log('sync decision:', path, 'upload', 'LOCAL_MODIFIED');
                await this.uploadFile(path, meta);
                continue;
              }
              console.log('sync decision:', path, 'upload', 'LOCAL_MODIFIED_OR_NO_BASE');
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
          stepErrors.push(`${path}: ${formatSyncError(e)}`);
        }
      }

      await this.saveMeta(meta);
      if (stepErrors.length > 0) {
        const preview =
          stepErrors.length <= 2
            ? stepErrors.join('；')
            : `${stepErrors.slice(0, 2).join('；')} 等共 ${stepErrors.length} 处`;
        new Notice(`❌ Sync Failed：部分文件同步失败（${preview}）`, 10000);
        return;
      }
      new Notice('✔ Sync Success');
    } catch (e) {
      new Notice('❌ Sync Failed：' + formatSyncError(e), 8000);
    } finally {
      this.syncRunning = false;
    }
  }
}
