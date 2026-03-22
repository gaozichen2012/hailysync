import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  FileSystemAdapter,
  TFile,
} from 'obsidian';
import type { Vault } from 'obsidian';
import axios, { isAxiosError } from 'axios';
import md5 from 'blueimp-md5';

/** 与 sync-server 约定的远端清单；与本地 .sync_meta.json 结构一致 */
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

interface SyncPluginSettings {
  serverUrl: string;
}

const DEFAULT_SETTINGS: SyncPluginSettings = {
  serverUrl: 'http://localhost:3000',
};

type SyncDecision =
  | 'noop'
  | 'upload'
  | 'download'
  | 'delete_local'
  | 'post_delete_remote'
  | 'conflict_keep_remote';

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
        'sync-server 根 URL，无末尾斜杠。需实现 GET /manifest、POST /upload、GET /download、POST /delete（JSON）。',
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

  getVaultBasePath(): string | null {
    const a = this.app.vault.adapter;
    if (a instanceof FileSystemAdapter) {
      return a.getBasePath();
    }
    return null;
  }

  shouldSkipSyncPath(path: string): boolean {
    const p = normalizeVaultPath(path);
    if (p === SYNC_META_FILENAME || p.endsWith(`/${SYNC_META_FILENAME}`)) return true;
    const cfg = normalizeVaultPath(this.app.vault.configDir);
    if (p === cfg || p.startsWith(`${cfg}/`)) return true;
    return false;
  }

  async loadSyncMeta(): Promise<SyncMetaMap> {
    try {
      const raw = await this.app.vault.adapter.read(SYNC_META_FILENAME);
      const parsed = JSON.parse(raw || '{}') as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as SyncMetaMap;
      }
    } catch {
      /* 首次或损坏则空 */
    }
    return {};
  }

  async saveSyncMeta(meta: SyncMetaMap): Promise<void> {
    const json = JSON.stringify(meta, null, 2);
    const exists = this.app.vault.getAbstractFileByPath(SYNC_META_FILENAME);
    if (exists instanceof TFile) {
      await this.app.vault.adapter.write(SYNC_META_FILENAME, json);
    } else {
      await this.app.vault.create(SYNC_META_FILENAME, json);
    }
  }

  collectLocalNotePaths(): string[] {
    return this.app.vault
      .getMarkdownFiles()
      .map((f) => normalizeVaultPath(f.path))
      .filter((p) => !this.shouldSkipSyncPath(p));
  }

  async fetchRemoteManifest(): Promise<SyncMetaMap> {
    try {
      const res = await axios.get(`${this.baseUrl}/manifest`, { responseType: 'json' });
      const data = res.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data as SyncMetaMap;
      }
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 404) {
        return {};
      }
      throw e;
    }
    return {};
  }

  async uploadFile(filePath: string): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    try {
      const content = await this.app.vault.adapter.read(normalized);
      const hash = md5(content || '');

      console.log('upload:', normalized, (content || '').length, hash);

      await axios.post(this.baseUrl + '/upload', {
        path: normalized,
        content: content || '',
        hash: hash,
        updated_at: Date.now(),
      });
    } catch (err) {
      console.error('upload failed:', normalized, err);
      throw err;
    }
  }

  async downloadFile(filePath: string): Promise<void> {
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

      console.log('download ok:', normalized);
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

  conflictBackupPath(originalPath: string): string {
    const normalized = normalizeVaultPath(originalPath);
    const ts = Date.now();
    const lastDot = normalized.lastIndexOf('.');
    if (lastDot > 0) {
      return `${normalized.slice(0, lastDot)}.conflict.${ts}${normalized.slice(lastDot)}`;
    }
    return `${normalized}.conflict.${ts}.md`;
  }

  async deleteLocalFile(path: string): Promise<void> {
    const normalized = normalizeVaultPath(path);
    const f = this.app.vault.getAbstractFileByPath(normalized);
    if (f instanceof TFile) {
      await this.app.vault.delete(f);
    }
  }

  private decidePath(args: {
    localHash: string | null;
    remote: SyncFileMeta | undefined;
    meta: SyncFileMeta | undefined;
  }): { decision: SyncDecision; detail: string } {
    const { localHash, remote, meta } = args;
    const localExists = localHash !== null;
    const remoteDeleted = remote?.deleted === true;
    const remoteHash =
      remote && !remoteDeleted && typeof remote.hash === 'string' && remote.hash.length > 0
        ? remote.hash
        : null;
    const last = meta && !meta.deleted && meta.hash ? meta.hash : null;

    if (remoteDeleted && localExists) {
      return { decision: 'delete_local', detail: 'REMOTE_DELETED' };
    }

    if (remoteDeleted && !localExists) {
      return { decision: 'noop', detail: 'REMOTE_DELETED_NO_LOCAL' };
    }

    if (!localExists && last && !meta?.deleted) {
      return { decision: 'post_delete_remote', detail: 'LOCAL_DELETED' };
    }

    if (!localExists && remoteHash) {
      return { decision: 'download', detail: 'REMOTE_NEW' };
    }

    if (localExists && remoteHash === null && !remoteDeleted) {
      return { decision: 'upload', detail: 'LOCAL_NEW' };
    }

    if (localExists && remoteHash) {
      if (localHash === remoteHash) {
        return { decision: 'noop', detail: 'same_hash' };
      }
      if (last === null) {
        return { decision: 'conflict_keep_remote', detail: 'both_modified_no_meta' };
      }
      if (localHash !== last && remoteHash !== last) {
        if (localHash === remoteHash) {
          return { decision: 'noop', detail: 'converged' };
        }
        return { decision: 'conflict_keep_remote', detail: 'both_modified' };
      }
      if (localHash === last && remoteHash !== last) {
        return { decision: 'download', detail: 'REMOTE_MODIFIED' };
      }
      if (remoteHash === last && localHash !== last) {
        return { decision: 'upload', detail: 'LOCAL_MODIFIED' };
      }
    }

    return { decision: 'noop', detail: 'none' };
  }

  async syncNow() {
    if (this.syncRunning) {
      new Notice('同步已在进行中');
      return;
    }
    this.syncRunning = true;

    try {
      const base = this.getVaultBasePath();
      if (!base) {
        new Notice('仅支持本地文件夹 vault（FileSystemAdapter）');
        return;
      }

      const server = this.baseUrl;
      if (!server) {
        new Notice('请先在设置中填写同步服务器地址');
        return;
      }

      new Notice('正在同步…');

      let meta = await this.loadSyncMeta();
      let remote: SyncMetaMap;
      try {
        remote = await this.fetchRemoteManifest();
      } catch {
        new Notice('同步中止：无法拉取远端 manifest');
        return;
      }

      const localPaths = this.collectLocalNotePaths();
      const pathSet = new Set<string>([
        ...localPaths,
        ...Object.keys(meta),
        ...Object.keys(remote),
      ]);

      const sortedPaths = [...pathSet].filter((p) => !this.shouldSkipSyncPath(p)).sort();

      for (const path of sortedPaths) {
        let localHash: string | null = null;
        const abstract = this.app.vault.getAbstractFileByPath(path);
        if (abstract instanceof TFile) {
          try {
            const content = await this.app.vault.adapter.read(path);
            localHash = md5(content || '');
          } catch {
            localHash = null;
          }
        }

        const m = meta[path];
        const r = remote[path];
        const { decision, detail } = this.decidePath({
          localHash,
          remote: r,
          meta: m,
        });

        console.log('sync decision:', path, decision, detail);

        try {
          if (decision === 'noop') {
            if (detail === 'REMOTE_DELETED_NO_LOCAL') {
              delete meta[path];
              continue;
            }
            if (localHash && r && !r.deleted && localHash === r.hash) {
              meta[path] = {
                hash: localHash,
                updated_at: Date.now(),
                deleted: false,
              };
            }
            continue;
          }

          if (decision === 'delete_local') {
            await this.deleteLocalFile(path);
            meta[path] = {
              hash: '',
              updated_at: Date.now(),
              deleted: true,
            };
            remote[path] = { hash: '', updated_at: Date.now(), deleted: true };
            continue;
          }

          if (decision === 'post_delete_remote') {
            await this.postDeleteRemote(path);
            delete meta[path];
            remote[path] = { hash: '', updated_at: Date.now(), deleted: true };
            continue;
          }

          if (decision === 'upload') {
            await this.uploadFile(path);
            const content = await this.app.vault.adapter.read(path);
            const h = md5(content || '');
            meta[path] = { hash: h, updated_at: Date.now(), deleted: false };
            continue;
          }

          if (decision === 'download') {
            await this.downloadFile(path);
            const content = await this.app.vault.adapter.read(path);
            const h = md5(content || '');
            const ru = r?.updated_at ?? Date.now();
            meta[path] = { hash: h, updated_at: ru, deleted: false };
            continue;
          }

          if (decision === 'conflict_keep_remote') {
            const abstractFile = this.app.vault.getAbstractFileByPath(path);
            if (abstractFile instanceof TFile) {
              const localContent = await this.app.vault.adapter.read(path);
              const backupPath = this.conflictBackupPath(path);
              await ensureVaultFoldersForPath(this.app.vault, backupPath);
              await this.app.vault.create(backupPath, localContent || '');
              console.log('sync decision:', backupPath, 'conflict_backup', detail);
            }
            await this.downloadFile(path);
            const content = await this.app.vault.adapter.read(path);
            const h = md5(content || '');
            const ru = r?.updated_at ?? Date.now();
            meta[path] = { hash: h, updated_at: ru, deleted: false };
          }
        } catch (e) {
          console.error('sync step failed:', path, e);
        }
      }

      await this.saveSyncMeta(meta);
      new Notice('同步完成');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice('同步失败：' + msg);
    } finally {
      this.syncRunning = false;
    }
  }
}
