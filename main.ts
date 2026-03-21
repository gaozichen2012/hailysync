import { Notice, Plugin, FileSystemAdapter } from 'obsidian';

// sync-core 为 CommonJS，由 esbuild 打入 main.js
// @ts-expect-error 无官方类型声明
const { runSync } = require('sync-core') as {
  runSync: (opts?: { server?: string }) => Promise<{ sessionId: string; aborted?: boolean }>;
};

interface SyncPluginSettings {
  serverUrl: string;
}

const DEFAULT_SETTINGS: SyncPluginSettings = {
  serverUrl: 'http://localhost:3000',
};

export default class ObsidianSyncPlugin extends Plugin {
  settings: SyncPluginSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

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
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getVaultBasePath(): string | null {
    const a = this.app.vault.adapter;
    if (a instanceof FileSystemAdapter) {
      return a.getBasePath();
    }
    return null;
  }

  async syncNow() {
    const base = this.getVaultBasePath();
    if (!base) {
      new Notice('仅支持本地文件夹 vault（FileSystemAdapter）');
      return;
    }

    process.env.SYNC_LOCAL_DIR = base;

    new Notice('正在同步…');
    try {
      const r = await runSync({ server: this.settings.serverUrl });
      if (r.aborted) {
        new Notice('同步中止：无法拉取远端文件列表');
      } else {
        new Notice('同步完成');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice('同步失败：' + msg);
    }
  }
}
