import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  FileSystemAdapter,
} from 'obsidian';

// sync-core 为 CommonJS，由 esbuild 打入 main.js
const { runSync } = require('sync-core') as {
  runSync: (opts?: { server?: string }) => Promise<{ sessionId: string; aborted?: boolean }>;
};

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
      .setDesc('sync-server 根 URL，无末尾斜杠。例如 http://公网IP:3000')
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

    const server = this.settings.serverUrl.trim().replace(/\/+$/, '');
    if (!server) {
      new Notice('请先在设置中填写同步服务器地址');
      return;
    }

    process.env.SYNC_LOCAL_DIR = base;

    new Notice('正在同步…');
    try {
      const r = await runSync({ server });
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
