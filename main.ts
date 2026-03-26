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
import { hostname, platform } from 'os';

/** 与 sync-server /files 及本地 .sync_meta.json 一致 */
interface SyncFileMeta {
  hash: string;
  updated_at: number;
  deleted?: boolean;
}

type SyncMetaMap = Record<string, SyncFileMeta>;

const SYNC_META_FILENAME = '.sync_meta.json';
/** 本地身份配置（不参与笔记同步，避免经同步服务覆盖各端 user_id） */
const SYNC_CONFIG_FILENAME = '.sync_config.json';

interface SyncIdentityConfig {
  user_id?: string;
  device_id?: string;
  /** 设备被服务端移除后需通过绑定码重连，禁止自动 init */
  pending_bind?: boolean;
  /** 仅当 pending_bind 时用于 UI 区分「被删除」与其它待绑定 */
  was_revoked?: boolean;
}

/** 与设置页、同步状态一致 */
type SyncConnectionState = 'initializing' | 'connected' | 'awaiting_bind';

interface ApiDeviceRow {
  device_id: string;
  device_name: string;
  device_type: string;
  last_active_at: number | null;
}

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
  if (p === SYNC_CONFIG_FILENAME || p.endsWith(`/${SYNC_CONFIG_FILENAME}`)) return false;
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

const BINDING_CODE_SHOW_MS = 20_000;
const BINDING_COPY_FEEDBACK_MS = 2500;

function getDeviceTypeLabel(): string {
  const p = platform();
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'mac';
  if (p === 'linux') return 'linux';
  return p || 'unknown';
}

function getDeviceDisplayName(): string {
  try {
    const h = hostname();
    if (h && typeof h === 'string' && h.trim()) return h.trim();
  } catch {
    /* ignore */
  }
  return 'Obsidian';
}

/** 脱敏：ABCD-****-WXYZ */
function maskBindingCode(code: string): string {
  const s = code.trim();
  if (!s) return '';
  const parts = s.split('-').filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[0]}-****-${parts[parts.length - 1]}`;
  }
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}-****-${s.slice(-4)}`;
}

function extractBindingCodeFromJson(data: unknown): string | null {
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (!isPlainObjectRecord(data)) return null;
  const c = data.binding_code ?? data.bindingCode ?? data.code;
  if (typeof c === 'string' && c.trim()) return c.trim();
  return null;
}

function parseDevicesListPayload(data: unknown): ApiDeviceRow[] {
  const rows: ApiDeviceRow[] = [];
  let arr: unknown[] = [];
  if (Array.isArray(data)) arr = data;
  else if (isPlainObjectRecord(data)) {
    const list = data.devices ?? data.data ?? data.list;
    if (Array.isArray(list)) arr = list;
  }
  for (const item of arr) {
    if (!isPlainObjectRecord(item)) continue;
    const id = item.device_id ?? item.id;
    if (typeof id !== 'string' || !id.trim()) continue;
    const name = item.device_name ?? item.name ?? '';
    const typ = item.device_type ?? item.type ?? '';
    const la = item.last_active_at ?? item.lastActiveAt ?? item.updated_at ?? item.updatedAt;
    let lastAt: number | null = null;
    if (typeof la === 'number' && Number.isFinite(la)) lastAt = la;
    else if (typeof la === 'string' && la.trim() !== '') {
      const n = Number(la);
      if (Number.isFinite(n)) lastAt = n;
    }
    rows.push({
      device_id: id.trim(),
      device_name: typeof name === 'string' ? name : String(name),
      device_type: typeof typ === 'string' ? typ : String(typ),
      last_active_at: lastAt,
    });
  }
  return rows;
}

function isDeviceRevokedError(err: unknown): boolean {
  if (!isAxiosError(err)) return false;
  const data = err.response?.data;
  if (isPlainObjectRecord(data as unknown) && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error === 'DEVICE_REVOKED';
  }
  if (typeof data === 'string' && data.trim()) {
    try {
      const parsed = JSON.parse(data.trim()) as unknown;
      if (isPlainObjectRecord(parsed) && typeof parsed.error === 'string') {
        return parsed.error === 'DEVICE_REVOKED';
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

function isNetworkError(err: unknown): boolean {
  if (!isAxiosError(err)) return false;
  if (err.code === 'ECONNABORTED') return true;
  if (!err.response) return true;
  return false;
}

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
    const data = err.response?.data;
    if (typeof data === 'string' && data.trim()) {
      const s = data.trim();
      try {
        const parsed = JSON.parse(s) as unknown;
        if (isPlainObjectRecord(parsed)) {
          const msg = parsed.message;
          if (typeof msg === 'string' && msg.trim()) return msg.trim();
          const errMsg = parsed.error;
          if (typeof errMsg === 'string' && errMsg.trim()) return errMsg.trim();
        }
      } catch {
        /* 非 JSON 字符串 */
      }
      if (s.length <= 200) return s;
    }
    if (isPlainObjectRecord(data as unknown)) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
      const errMsg = (data as { error?: unknown }).error;
      if (typeof errMsg === 'string' && errMsg.trim()) return errMsg.trim();
    }
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

  private maskedBindingText = '';
  private revealedFullCode: string | null = null;
  private revealExpireAt: number | null = null;
  private bindingError: string | null = null;
  private bindingCopyFeedback: string | null = null;
  private bindingPanelEl: HTMLElement | null = null;
  private bindingCountdownInterval: ReturnType<typeof window.setInterval> | null = null;
  private bindingHideTimeout: ReturnType<typeof window.setTimeout> | null = null;
  private bindingCopyFeedbackTimeout: ReturnType<typeof window.setTimeout> | null = null;
  private deviceListEl: HTMLElement | null = null;
  private devices: ApiDeviceRow[] = [];
  private devicesError: string | null = null;
  private devicesLoading = false;

  constructor(app: App, plugin: ObsidianSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.plugin.register(() => this.clearBindingTimers());
  }

  private clearBindingTimers(): void {
    if (this.bindingCountdownInterval != null) {
      window.clearInterval(this.bindingCountdownInterval);
      this.bindingCountdownInterval = null;
    }
    if (this.bindingHideTimeout != null) {
      window.clearTimeout(this.bindingHideTimeout);
      this.bindingHideTimeout = null;
    }
    if (this.bindingCopyFeedbackTimeout != null) {
      window.clearTimeout(this.bindingCopyFeedbackTimeout);
      this.bindingCopyFeedbackTimeout = null;
    }
  }

  private syncRevealExpiry(): void {
    if (
      this.revealedFullCode &&
      this.revealExpireAt != null &&
      Date.now() >= this.revealExpireAt
    ) {
      this.revealedFullCode = null;
      this.revealExpireAt = null;
    }
  }

  private renderBindingPanel(): void {
    const panel = this.bindingPanelEl;
    if (!panel) return;
    panel.empty();

    if (this.bindingError) {
      panel.createEl('div', {
        cls: 'setting-item-description vault-sync-binding-error',
        text: this.bindingError,
      });
    }

    if (this.bindingCopyFeedback) {
      panel.createEl('div', {
        cls: 'setting-item-description vault-sync-binding-copy-ok',
        text: this.bindingCopyFeedback,
      });
    }

    this.syncRevealExpiry();

    if (
      this.revealedFullCode &&
      this.revealExpireAt != null &&
      Date.now() < this.revealExpireAt
    ) {
      const row = panel.createDiv({ cls: 'vault-sync-binding-code-row' });
      row.createSpan({ text: '绑定码：' });
      row.createSpan({
        cls: 'vault-sync-binding-code',
        text: this.revealedFullCode,
      });
      const sec = Math.max(0, Math.ceil((this.revealExpireAt - Date.now()) / 1000));
      row.createSpan({
        cls: 'vault-sync-binding-countdown',
        text: `（${sec}s 后自动隐藏）`,
      });
    } else {
      panel.createEl('div', {
        cls: 'setting-item-description',
        text: `脱敏绑定码：${this.maskedBindingText || '—'}`,
      });
    }
  }

  private scheduleRevealHide(): void {
    if (!this.revealedFullCode || this.revealExpireAt == null) return;
    const remain = this.revealExpireAt - Date.now();
    if (remain <= 0) {
      this.revealedFullCode = null;
      this.revealExpireAt = null;
      this.renderBindingPanel();
      return;
    }

    this.bindingHideTimeout = window.setTimeout(() => {
      this.bindingHideTimeout = null;
      this.revealedFullCode = null;
      this.revealExpireAt = null;
      if (this.bindingCountdownInterval != null) {
        window.clearInterval(this.bindingCountdownInterval);
        this.bindingCountdownInterval = null;
      }
      this.renderBindingPanel();
    }, remain);

    this.bindingCountdownInterval = window.setInterval(() => {
      this.syncRevealExpiry();
      if (!this.revealedFullCode) {
        this.clearBindingTimers();
        this.renderBindingPanel();
        return;
      }
      this.renderBindingPanel();
    }, 1000);
  }

  private async refreshBindingMaskOnly(): Promise<void> {
    const code = await this.plugin.fetchBindingCodeRaw();
    this.maskedBindingText = code ? maskBindingCode(code) : '';
  }

  private async onShowReveal(): Promise<void> {
    if (!this.plugin.deviceId) {
      new Notice('请先完成设备初始化或绑定');
      return;
    }
    this.clearBindingTimers();
    this.bindingError = null;
    const code = await this.plugin.fetchBindingCodeRaw();
    if (!code) {
      this.bindingError = '无法获取绑定码';
      this.renderBindingPanel();
      return;
    }
    this.revealedFullCode = code;
    this.revealExpireAt = Date.now() + BINDING_CODE_SHOW_MS;
    this.renderBindingPanel();
    this.scheduleRevealHide();
  }

  private async copyFullBindingCode(): Promise<void> {
    if (!this.plugin.deviceId) {
      new Notice('请先完成设备初始化或绑定');
      return;
    }
    const code = await this.plugin.fetchBindingCodeRaw();
    if (!code) {
      this.bindingError = '无法获取绑定码';
      this.renderBindingPanel();
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      this.bindingCopyFeedback = '已复制到剪贴板';
      if (this.bindingCopyFeedbackTimeout != null) {
        window.clearTimeout(this.bindingCopyFeedbackTimeout);
      }
      this.bindingCopyFeedbackTimeout = window.setTimeout(() => {
        this.bindingCopyFeedbackTimeout = null;
        this.bindingCopyFeedback = null;
        this.renderBindingPanel();
      }, BINDING_COPY_FEEDBACK_MS);
      this.bindingError = null;
      this.renderBindingPanel();
    } catch {
      this.bindingCopyFeedback = null;
      this.bindingError = '复制失败，请手动复制';
      this.renderBindingPanel();
    }
  }

  private async onResetBinding(): Promise<void> {
    if (!this.plugin.deviceId) {
      new Notice('请先完成设备初始化或绑定');
      return;
    }
    this.clearBindingTimers();
    this.revealedFullCode = null;
    this.revealExpireAt = null;
    this.bindingError = null;
    const ok = await this.plugin.resetBindingCodeOnServer();
    if (ok) {
      await this.refreshBindingMaskOnly();
      new Notice('绑定码已重置');
    } else {
      this.bindingError = '重置失败';
    }
    this.renderBindingPanel();
  }

  private renderDeviceList(): void {
    const wrap = this.deviceListEl;
    if (!wrap) return;
    wrap.empty();

    if (!this.plugin.deviceId) {
      wrap.createEl('div', {
        cls: 'setting-item-description',
        text: '设备未连接，绑定或初始化成功后即可管理设备列表。',
      });
      return;
    }

    if (this.devicesLoading) {
      wrap.createEl('div', { cls: 'setting-item-description', text: '加载中…' });
      return;
    }
    if (this.devicesError) {
      wrap.createEl('div', {
        cls: 'setting-item-description vault-sync-binding-error',
        text: this.devicesError,
      });
      return;
    }
    if (this.devices.length === 0) {
      wrap.createEl('div', { cls: 'setting-item-description', text: '暂无设备' });
      return;
    }

    const table = wrap.createEl('table', { cls: 'vault-sync-device-table' });
    const thead = table.createEl('thead');
    const hr = thead.createEl('tr');
    hr.createEl('th', { text: '设备名' });
    hr.createEl('th', { text: '类型' });
    hr.createEl('th', { text: '最近活跃' });
    hr.createEl('th', { text: '操作' });

    const tbody = table.createEl('tbody');
    for (const d of this.devices) {
      const tr = tbody.createEl('tr');
      tr.createEl('td', { text: d.device_name || '—' });
      tr.createEl('td', { text: d.device_type || '—' });
      const last =
        d.last_active_at != null && Number.isFinite(d.last_active_at)
          ? new Date(d.last_active_at).toLocaleString()
          : '—';
      const tdMark = tr.createEl('td');
      tdMark.appendText(last);
      if (d.device_id === this.plugin.deviceId) {
        tdMark.appendText(' ');
        tdMark.createSpan({ cls: 'vault-sync-tag-current', text: '（当前设备）' });
      }
      const tdOp = tr.createEl('td');
      const isCurrent = d.device_id === this.plugin.deviceId;
      if (!isCurrent) {
        const btn = tdOp.createEl('button', { cls: 'vault-sync-binding-copy-btn', text: '删除' });
        btn.type = 'button';
        btn.addEventListener('click', () => {
          if (
            window.confirm(`确定从账号中移除设备「${d.device_name || d.device_id}」？`)
          ) {
            void this.plugin.deleteDeviceOnServer(d.device_id).then((ok) => {
              if (ok) void this.reloadDevices();
            });
          }
        });
      } else {
        tdOp.createSpan({ cls: 'setting-item-description', text: '—' });
      }
    }
  }

  private async reloadDevices(): Promise<void> {
    if (!this.plugin.deviceId) {
      this.devices = [];
      this.renderDeviceList();
      return;
    }
    this.devicesLoading = true;
    this.devicesError = null;
    this.renderDeviceList();
    const res = await this.plugin.fetchDevicesList();
    this.devicesLoading = false;
    if (res.ok) {
      this.devices = res.devices;
    } else {
      this.devicesError = res.message;
    }
    this.renderDeviceList();
  }

  private statusLine(): string {
    const st = this.plugin.connectionState;
    if (st === 'initializing') return '状态：未初始化…';
    if (st === 'connected') return '状态：已连接';
    if (this.plugin.wasRevoked) return '状态：已失效（被删除）';
    return '状态：待绑定（请输入绑定码或等待初始化）';
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.clearBindingTimers();
    this.bindingPanelEl = null;
    this.deviceListEl = null;
    this.bindingCopyFeedback = null;
    this.revealedFullCode = null;
    this.revealExpireAt = null;
    this.bindingError = null;
    this.devicesError = null;

    containerEl.createEl('h2', { text: 'Vault Sync' });

    const statusSection = containerEl.createDiv();
    statusSection.createEl('div', { cls: 'setting-item-description', text: this.statusLine() });

    const identitySection = containerEl.createDiv();
    identitySection.createEl('div', {
      cls: 'setting-item-description',
      text: '正在读取身份…',
    });

    const bindingBlock = containerEl.createDiv({ cls: 'vault-sync-binding-block' });
    bindingBlock.createEl('div', {
      cls: 'setting-item-description',
      text: '这是你连接新设备和恢复同步身份的唯一凭证，请妥善保存。',
    });
    new Setting(bindingBlock)
      .setName('设备绑定码')
      .setDesc('「显示」后完整码 20 秒自动隐藏；「复制」始终复制完整码；「重置」后旧码失效。')
      .addButton((btn) =>
        btn.setButtonText('显示').onClick(() => {
          void this.onShowReveal();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText('复制').onClick(() => {
          void this.copyFullBindingCode();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText('重置').onClick(() => {
          void this.onResetBinding();
        }),
      );
    this.bindingPanelEl = bindingBlock.createDiv({ cls: 'vault-sync-binding-panel' });
    this.renderBindingPanel();

    const devBlock = containerEl.createDiv({ cls: 'vault-sync-devices-block' });
    new Setting(devBlock)
      .setName('已绑定设备')
      .setDesc('删除其他设备后，该设备将停止同步。当前设备不可删除。')
      .addButton((btn) =>
        btn.setButtonText('刷新列表').onClick(() => {
          void this.reloadDevices();
        }),
      );
    this.deviceListEl = devBlock.createDiv({ cls: 'vault-sync-device-list' });
    this.renderDeviceList();

    let bindingInput: HTMLInputElement | null = null;
    new Setting(containerEl)
      .setName('绑定新设备')
      .setDesc('输入 binding_code 后绑定；成功后将保存 user_id / device_id 并开始同步。')
      .addText((text) => {
        bindingInput = text.inputEl;
        text.setPlaceholder('binding_code');
      })
      .addButton((btn) =>
        btn.setButtonText('绑定').onClick(() => {
          const code = bindingInput?.value?.trim() ?? '';
          void this.plugin.bindWithCode(code).then((ok) => {
            if (ok) this.display();
          });
        }),
      );

    new Setting(containerEl)
      .setName('Enable Sync')
      .setDesc(
        '关闭时不执行同步（含启动延迟与每 60 秒自动同步）；开启后可使用下方「手动同步」或命令面板中的 Sync now。',
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableSync).onChange(async (value) => {
          this.plugin.settings.enableSync = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Manual Sync')
      .setDesc('立即执行一次同步（不依赖自动触发）。')
      .addButton((btn) =>
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

    void this.plugin.ensureDeviceIdentity().then(async () => {
      statusSection.empty();
      statusSection.createEl('div', { cls: 'setting-item-description', text: this.statusLine() });

      identitySection.empty();
      identitySection.createEl('div', {
        cls: 'setting-item-description',
        text: `user_id：${this.plugin.userId || '—'}`,
      });
      identitySection.createEl('div', {
        cls: 'setting-item-description',
        text: `device_id：${this.plugin.deviceId || '—'}`,
      });
      identitySection.createEl('div', {
        cls: 'setting-item-description',
        text: `server_url（插件设置）：${this.plugin.baseUrl}`,
      });

      if (this.plugin.connectionState === 'connected' && this.plugin.deviceId) {
        await this.refreshBindingMaskOnly();
        this.renderBindingPanel();
        void this.reloadDevices();
      }
    });
  }
}

const SYNC_STATUS_RESULT_MS = 3500;
const AUTO_SYNC_INTERVAL_MS = 60_000;
const AUTO_SYNC_START_MIN_MS = 2000;
const AUTO_SYNC_START_MAX_MS = 5000;

export default class ObsidianSyncPlugin extends Plugin {
  settings: SyncPluginSettings = DEFAULT_SETTINGS;
  /** 由 `.sync_config.json` 与服务端同步 */
  userId = '';
  deviceId = '';
  connectionState: SyncConnectionState = 'initializing';
  /** 是否因 DEVICE_REVOKED 进入待绑定（与 .sync_config.json 的 was_revoked 一致） */
  wasRevoked = false;
  private syncRunning = false;
  private statusBarItem: HTMLElement | null = null;
  private statusResultTimer: ReturnType<typeof window.setTimeout> | null = null;
  private autoSyncStartupTimerId: ReturnType<typeof window.setTimeout> | null = null;

  async onload() {
    await this.loadSettings();
    await this.ensureDeviceIdentity();

    this.initSyncStatusBar();

    this.addSettingTab(new VaultSyncSettingTab(this.app, this));

    this.addCommand({
      id: 'sync-now',
      name: 'Sync now',
      callback: () => {
        void this.syncNow();
      },
    });

    const startupDelay =
      AUTO_SYNC_START_MIN_MS +
      Math.floor(Math.random() * (AUTO_SYNC_START_MAX_MS - AUTO_SYNC_START_MIN_MS + 1));
    this.autoSyncStartupTimerId = window.setTimeout(() => {
      this.autoSyncStartupTimerId = null;
      if (
        this.settings.enableSync &&
        this.connectionState === 'connected' &&
        this.deviceId
      ) {
        void this.syncNow({ auto: true });
      }
    }, startupDelay);
    this.register(() => {
      if (this.autoSyncStartupTimerId != null) {
        window.clearTimeout(this.autoSyncStartupTimerId);
        this.autoSyncStartupTimerId = null;
      }
    });

    const intervalId = window.setInterval(() => {
      if (!this.settings.enableSync) return;
      if (this.connectionState !== 'connected' || !this.deviceId) return;
      void this.syncNow({ auto: true });
    }, AUTO_SYNC_INTERVAL_MS);
    this.registerInterval(intervalId);
  }

  onunload(): void {
    this.clearStatusResultTimer();
  }

  private initSyncStatusBar(): void {
    this.statusBarItem = this.addStatusBarItem();
    this.setSyncStatusIdle();
  }

  private clearStatusResultTimer(): void {
    if (this.statusResultTimer != null) {
      window.clearTimeout(this.statusResultTimer);
      this.statusResultTimer = null;
    }
  }

  private setSyncStatusText(text: string): void {
    if (this.statusBarItem) {
      this.statusBarItem.textContent = text;
    }
  }

  private setSyncStatusIdle(): void {
    this.clearStatusResultTimer();
    this.setSyncStatusText('🟢 Sync Idle');
  }

  private setSyncStatusSyncing(): void {
    this.clearStatusResultTimer();
    this.setSyncStatusText('🔄 Syncing...');
  }

  private setSyncStatusSuccess(): void {
    this.clearStatusResultTimer();
    this.setSyncStatusText('✔ Synced');
    this.statusResultTimer = window.setTimeout(() => {
      this.statusResultTimer = null;
      this.setSyncStatusIdle();
    }, SYNC_STATUS_RESULT_MS);
  }

  private setSyncStatusFailed(): void {
    this.clearStatusResultTimer();
    this.setSyncStatusText('❌ Sync Failed');
    this.statusResultTimer = window.setTimeout(() => {
      this.statusResultTimer = null;
      this.setSyncStatusIdle();
    }, SYNC_STATUS_RESULT_MS);
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

  private deviceHeaders(): Record<string, string> {
    if (!this.deviceId) return {};
    return { 'x-device-id': this.deviceId };
  }

  /** pending_bind 时仅待绑定；否则读盘或 POST /api/init */
  async ensureDeviceIdentity(): Promise<void> {
    if (this.userId && this.deviceId && this.connectionState === 'connected') return;

    try {
      const raw = await this.app.vault.adapter.read(SYNC_CONFIG_FILENAME);
      const parsed = JSON.parse(raw || '{}') as unknown;
      if (isPlainObjectRecord(parsed) && parsed.pending_bind === true) {
        this.userId = '';
        this.deviceId = '';
        this.wasRevoked = parsed.was_revoked === true;
        this.connectionState = 'awaiting_bind';
        return;
      }
      if (
        isPlainObjectRecord(parsed) &&
        typeof parsed.user_id === 'string' &&
        parsed.user_id.trim() !== '' &&
        typeof parsed.device_id === 'string' &&
        parsed.device_id.trim() !== ''
      ) {
        this.userId = parsed.user_id.trim();
        this.deviceId = parsed.device_id.trim();
        this.wasRevoked = false;
        this.connectionState = 'connected';
        return;
      }
      if (
        isPlainObjectRecord(parsed) &&
        typeof parsed.user_id === 'string' &&
        parsed.user_id.trim() !== '' &&
        !parsed.device_id
      ) {
        this.userId = '';
        this.deviceId = '';
        this.wasRevoked = false;
        this.connectionState = 'awaiting_bind';
        await this.app.vault.adapter.write(
          SYNC_CONFIG_FILENAME,
          JSON.stringify({ pending_bind: true } satisfies SyncIdentityConfig, null, 2),
        );
        new Notice('检测到旧版仅 user_id 的配置，请输入绑定码完成设备绑定', 12000);
        return;
      }
    } catch {
      /* 不存在或无法读取 */
    }

    this.connectionState = 'initializing';
    await this.callApiInit();
  }

  private async callApiInit(): Promise<void> {
    const server = this.baseUrl;
    if (!server) {
      this.connectionState = 'awaiting_bind';
      new Notice('无效的服务器地址');
      return;
    }
    try {
      const res = await axios.post<{
        user_id?: string;
        device_id?: string;
        binding_code?: string;
      }>(`${server}/api/init`, {
        device_name: getDeviceDisplayName(),
        device_type: getDeviceTypeLabel(),
      });
      const uid = res.data?.user_id;
      const did = res.data?.device_id;
      if (typeof uid !== 'string' || !uid.trim() || typeof did !== 'string' || !did.trim()) {
        this.connectionState = 'awaiting_bind';
        new Notice('初始化失败：服务端未返回 user_id / device_id');
        return;
      }
      await this.persistFullIdentity(uid.trim(), did.trim());
    } catch (e) {
      this.connectionState = 'awaiting_bind';
      if (isNetworkError(e)) {
        new Notice('网络异常，请稍后重试');
      } else {
        new Notice('初始化失败：' + formatSyncError(e));
      }
    }
  }

  private async persistFullIdentity(userId: string, deviceId: string): Promise<void> {
    this.userId = userId.trim();
    this.deviceId = deviceId.trim();
    this.connectionState = 'connected';
    this.wasRevoked = false;
    await this.app.vault.adapter.write(
      SYNC_CONFIG_FILENAME,
      JSON.stringify(
        { user_id: this.userId, device_id: this.deviceId } satisfies SyncIdentityConfig,
        null,
        2,
      ),
    );
  }

  async handleDeviceRevoked(): Promise<void> {
    this.connectionState = 'awaiting_bind';
    this.wasRevoked = true;
    this.userId = '';
    this.deviceId = '';
    await this.app.vault.adapter.write(
      SYNC_CONFIG_FILENAME,
      JSON.stringify(
        { pending_bind: true, was_revoked: true } satisfies SyncIdentityConfig,
        null,
        2,
      ),
    );
  }

  async fetchBindingCodeRaw(): Promise<string | null> {
    await this.ensureDeviceIdentity();
    if (!this.deviceId) return null;
    const server = this.baseUrl;
    if (!server) return null;
    try {
      const res = await axios.get(`${server}/api/binding-code`, {
        headers: this.deviceHeaders(),
      });
      return extractBindingCodeFromJson(res.data);
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new Notice('当前设备已被移除，请重新输入设备绑定码连接', 12000);
        return null;
      }
      if (isNetworkError(e)) {
        new Notice('网络异常，请稍后重试');
        return null;
      }
      return null;
    }
  }

  async resetBindingCodeOnServer(): Promise<boolean> {
    if (!this.deviceId) return false;
    const server = this.baseUrl;
    if (!server) return false;
    try {
      await axios.post(`${server}/api/binding-code/reset`, {}, { headers: this.deviceHeaders() });
      return true;
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new Notice('当前设备已被移除，请重新输入设备绑定码连接', 12000);
        return false;
      }
      if (isNetworkError(e)) {
        new Notice('网络异常，请稍后重试');
        return false;
      }
      return false;
    }
  }

  async fetchDevicesList(): Promise<
    { ok: true; devices: ApiDeviceRow[] } | { ok: false; message: string }
  > {
    if (!this.deviceId) return { ok: false, message: '无效的设备' };
    try {
      const res = await axios.get(`${this.baseUrl}/api/devices`, {
        headers: this.deviceHeaders(),
      });
      const devices = parseDevicesListPayload(res.data);
      return { ok: true, devices };
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        return { ok: false, message: '当前设备已被移除' };
      }
      if (isNetworkError(e)) {
        return { ok: false, message: '网络异常，请稍后重试' };
      }
      return { ok: false, message: formatSyncError(e) };
    }
  }

  async deleteDeviceOnServer(targetId: string): Promise<boolean> {
    if (!this.deviceId) return false;
    const server = this.baseUrl;
    if (!server) return false;
    try {
      await axios.post(
        `${server}/api/device/delete`,
        { device_id: targetId },
        { headers: this.deviceHeaders() },
      );
      new Notice('已删除设备');
      return true;
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new Notice('当前设备已被移除，请重新输入设备绑定码连接', 12000);
        return false;
      }
      if (isNetworkError(e)) {
        new Notice('网络异常，请稍后重试');
        return false;
      }
      new Notice('删除失败：' + formatSyncError(e));
      return false;
    }
  }

  async bindWithCode(raw: string): Promise<boolean> {
    const code = raw.trim();
    if (!code) {
      new Notice('请输入绑定码');
      return false;
    }
    const server = this.baseUrl;
    if (!server) {
      new Notice('绑定失败：无效的服务器地址', 6000);
      return false;
    }
    try {
      const res = await axios.post<{ user_id?: string; device_id?: string }>(
        `${server}/api/bind`,
        {
          binding_code: code,
          device_name: getDeviceDisplayName(),
          device_type: getDeviceTypeLabel(),
        },
      );
      const uid = res.data?.user_id;
      const did = res.data?.device_id;
      if (typeof uid !== 'string' || !uid.trim() || typeof did !== 'string' || !did.trim()) {
        new Notice('绑定失败：服务端未返回有效 user_id / device_id', 6000);
        return false;
      }
      await this.persistFullIdentity(uid.trim(), did.trim());
      new Notice('已绑定，将开始同步');
      void this.syncNow();
      return true;
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new Notice('当前设备已被移除，请重新输入设备绑定码连接', 12000);
        return false;
      }
      if (isNetworkError(e)) {
        new Notice('网络异常，请稍后重试');
        return false;
      }
      new Notice('设备绑定码无效或已失效');
      return false;
    }
  }

  private syncQueryParams(): { user_id: string } {
    if (!this.userId) throw new Error('user_id 未初始化');
    return { user_id: this.userId };
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
    const res = await axios.get(this.baseUrl + '/files', {
      params: this.syncQueryParams(),
      headers: this.deviceHeaders(),
      responseType: 'text',
    });
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
      await axios.post(
        this.baseUrl + '/upload',
        {
          path: normalized,
          content: content || '',
          hash,
          updated_at,
        },
        { params: this.syncQueryParams(), headers: this.deviceHeaders() },
      );

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
        params: { path: normalized, ...this.syncQueryParams() },
        headers: this.deviceHeaders(),
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
      params: { path: normalized, ...this.syncQueryParams() },
      headers: this.deviceHeaders(),
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
    await axios.post(
      this.baseUrl + '/delete',
      {
        path: normalized,
      },
      { params: this.syncQueryParams(), headers: this.deviceHeaders() },
    );
  }

  async deleteLocalFile(path: string): Promise<void> {
    const normalized = normalizeVaultPath(path);
    const f = this.app.vault.getAbstractFileByPath(normalized);
    if (f instanceof TFile) {
      await this.app.vault.delete(f);
    }
  }

  async syncNow(options?: { auto?: boolean }) {
    const isAuto = options?.auto === true;
    await this.ensureDeviceIdentity();

    if (this.syncRunning) {
      new Notice('同步已在进行中');
      return;
    }
    this.syncRunning = true;

    try {
      if (!this.settings.enableSync) {
        this.setSyncStatusFailed();
        new Notice('❌ Sync Failed：同步已关闭，请先在设置中开启 Enable Sync');
        if (isAuto) console.log('[auto-sync] failed');
        return;
      }

      const server = this.baseUrl;
      if (!server) {
        this.setSyncStatusFailed();
        new Notice('❌ Sync Failed：无效的服务器地址');
        if (isAuto) console.log('[auto-sync] failed');
        return;
      }

      if (!this.deviceId || this.connectionState !== 'connected') {
        this.setSyncStatusFailed();
        if (this.wasRevoked) {
          new Notice('当前设备已被移除，请重新输入设备绑定码连接', 12000);
        } else {
          new Notice('请先完成设备初始化或输入绑定码后再同步', 8000);
        }
        if (isAuto) console.log('[auto-sync] failed');
        return;
      }

      if (isAuto) console.log('[auto-sync] start');
      this.setSyncStatusSyncing();
      new Notice('正在同步…');

      const meta = await this.loadMeta();
      for (const k of Object.keys(meta)) {
        if (!shouldSync(k)) delete meta[k];
      }

      let remote: SyncMetaMap;
      try {
        remote = await this.fetchRemoteFiles();
      } catch (err) {
        if (isDeviceRevokedError(err)) {
          await this.handleDeviceRevoked();
          this.setSyncStatusFailed();
          new Notice('当前设备已被移除，请重新输入设备绑定码连接', 12000);
          if (isAuto) console.log('[auto-sync] failed');
          return;
        }
        this.setSyncStatusFailed();
        if (isNetworkError(err)) {
          new Notice('网络异常，请稍后重试', 8000);
        } else {
          const detail = formatSyncError(err);
          new Notice(`❌ Sync Failed：无法拉取 /files（${server}）。${detail}`, 8000);
        }
        if (isAuto) console.log('[auto-sync] failed');
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
          if (isDeviceRevokedError(e)) {
            await this.handleDeviceRevoked();
            this.setSyncStatusFailed();
            new Notice('当前设备已被移除，请重新输入设备绑定码连接', 12000);
            if (isAuto) console.log('[auto-sync] failed');
            return;
          }
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
        this.setSyncStatusFailed();
        new Notice(`❌ Sync Failed：部分文件同步失败（${preview}）`, 10000);
        if (isAuto) console.log('[auto-sync] failed');
        return;
      }
      this.setSyncStatusSuccess();
      new Notice('✔ Sync Success');
      if (isAuto) console.log('[auto-sync] success');
    } catch (e) {
      this.setSyncStatusFailed();
      if (isNetworkError(e)) {
        new Notice('网络异常，请稍后重试', 8000);
      } else {
        new Notice('❌ Sync Failed：' + formatSyncError(e), 8000);
      }
      if (isAuto) console.log('[auto-sync] failed');
    } finally {
      this.syncRunning = false;
    }
  }
}
