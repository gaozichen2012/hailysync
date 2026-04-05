import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from 'obsidian';
import type { Vault } from 'obsidian';
import md5 from 'blueimp-md5';
import { hostname, platform } from 'os';
import {
  ENCRYPTION_VERSION_WIRE,
  assertEnvelopeShape,
  base64urlToBytes,
  bytesToBase64url,
  decryptWireToPlain,
  deriveKek,
  encryptPlainToWire,
  normalizeBindingCode,
  randomBytes,
  sha256HexOfBytes,
  unwrapVaultKeyFromEnvelope,
  wrapVaultKeyToEnvelope,
  type VaultEnvelopeJson,
} from './crypto-e2ee';
import {
  appendQueryUrl,
  buildMultipartFormData,
  headerGet,
  httpErrorFromResponse,
  isHttpRequestError,
  syncHttpRequest,
} from './sync-http';

/** 与 sync-server /files 及本地 .sync_meta.json 一致（E2EE） */
interface SyncFileMeta {
  cipher_hash: string | null;
  cipher_size: number | null;
  updated_at: number;
  deleted?: boolean;
  encryption_version: number;
  vault_key_version: number;
  /** 本地明文 MD5，仅用于冲突检测，不上报 */
  plain_fingerprint: string;
}

type SyncMetaMap = Record<string, SyncFileMeta>;

const SYNC_META_FILENAME = '.sync_meta.json';
/** 本地身份配置（不参与笔记同步，避免经同步服务覆盖各端 user_id） */
const SYNC_CONFIG_FILENAME = '.sync_config.json';
/** 本地 vault 密钥缓存（不参与 vault 同步） */
const SYNC_CRYPTO_FILENAME = '.sync_crypto.json';

interface SyncIdentityConfig {
  user_id?: string;
  device_id?: string;
  /** 仅 vault 根目录 .sync_config，用于丢失 .sync_crypto.json 时自动 GET envelope + 解封（用户可自行删除该字段） */
  binding_code?: string;
  /** 设备被服务端移除后需通过绑定码重连，禁止自动 init */
  pending_bind?: boolean;
  /** 仅当 pending_bind 时用于 UI 区分「被删除」与其它待绑定 */
  was_revoked?: boolean;
}

interface SyncCryptoLocalFile {
  vault_key_b64u: string;
  vault_key_version: number;
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
  if (!p) return p;
  const s = p.replace(/\\/g, '/');
  return s
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.')
    .join('/');
}

/** 路径是否落在 Obsidian vault 配置目录下（路径取自 `Vault#configDir`，勿手写目录名） */
function pathUnderVaultConfig(normalizedPath: string, vaultConfigDir: string): boolean {
  const cfg = normalizeVaultPath(vaultConfigDir);
  if (!cfg) return false;
  const p = normalizedPath;
  return p === cfg || p.startsWith(`${cfg}/`);
}

/** 不参与同步的路径（隐藏项、配置目录、同步元数据） */
function shouldSync(filePath: string, vaultConfigDir: string): boolean {
  if (!filePath) return false;
  const p = normalizeVaultPath(filePath);
  if (p.startsWith('.')) return false;
  if (pathUnderVaultConfig(p, vaultConfigDir)) return false;
  if (p === SYNC_META_FILENAME || p.endsWith(`/${SYNC_META_FILENAME}`)) return false;
  if (p === SYNC_CONFIG_FILENAME || p.endsWith(`/${SYNC_CONFIG_FILENAME}`)) return false;
  if (p === SYNC_CRYPTO_FILENAME || p.endsWith(`/${SYNC_CRYPTO_FILENAME}`)) return false;
  return true;
}

function isPlainObjectRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * GET /files：冻结协议 { items: [...] }，deleted=true 时 cipher_hash/cipher_size 为 null。
 */
function parseRemoteFilesItems(parsed: unknown, vaultConfigDir: string): SyncMetaMap {
  if (!isPlainObjectRecord(parsed)) throw new Error('/files 响应必须为 JSON 对象');
  const items = parsed.items;
  if (!Array.isArray(items)) throw new Error('/files 必须为 { items: array }');

  const out: SyncMetaMap = {};
  for (let i = 0; i < items.length; i++) {
    const rawItem = items[i];
    if (!isPlainObjectRecord(rawItem)) {
      throw new Error(`/files items[${i}] 必须为对象`);
    }
    const rp = rawItem.relative_path;
    if (typeof rp !== 'string' || !rp.trim()) {
      throw new Error('/files 某项缺少 relative_path');
    }
    const path = normalizeVaultPath(rp);
    if (!shouldSync(path, vaultConfigDir)) continue;

    const updatedRaw = rawItem.updated_at;
    const updated_at =
      typeof updatedRaw === 'number' && Number.isFinite(updatedRaw)
        ? updatedRaw
        : typeof updatedRaw === 'string' && updatedRaw.trim() !== ''
          ? Number(updatedRaw)
          : NaN;
    if (!Number.isFinite(updated_at)) {
      throw new Error(`/files ${path} updated_at 无效`);
    }

    const ev = rawItem.encryption_version;
    const vv = rawItem.vault_key_version;
    if (typeof ev !== 'number' || !Number.isFinite(ev)) {
      throw new Error(`/files ${path} encryption_version 无效`);
    }
    if (typeof vv !== 'number' || !Number.isFinite(vv)) {
      throw new Error(`/files ${path} vault_key_version 无效`);
    }

    const deleted = rawItem.deleted === true;
    if (deleted) {
      if (rawItem.cipher_hash !== null) {
        throw new Error(`/files ${path} deleted=true 时 cipher_hash 须为 null`);
      }
      if (rawItem.cipher_size !== null) {
        throw new Error(`/files ${path} deleted=true 时 cipher_size 须为 null`);
      }
      out[path] = {
        cipher_hash: null,
        cipher_size: null,
        updated_at,
        deleted: true,
        encryption_version: ev,
        vault_key_version: vv,
        plain_fingerprint: '',
      };
      continue;
    }

    const ch = rawItem.cipher_hash;
    const cs = rawItem.cipher_size;
    if (typeof ch !== 'string' || !ch.trim()) {
      throw new Error(`/files ${path} 缺少 cipher_hash`);
    }
    if (typeof cs !== 'number' || !Number.isFinite(cs)) {
      throw new Error(`/files ${path} cipher_size 无效`);
    }
    out[path] = {
      cipher_hash: ch.trim().toLowerCase(),
      cipher_size: cs,
      updated_at,
      deleted: false,
      encryption_version: ev,
      vault_key_version: vv,
      plain_fingerprint: '',
    };
  }
  return out;
}

/**
 * 产品默认同步服务基址（非调试占位；用户可在设置中改为自建 sync-server）。
 * 上架仓库公开此地址即允许用户直连官方/默认云端，与是否「敏感」无关；勿在此提交任何密钥。
 */
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

/** 设备列表「类型」列展示映射，不改协议与上报值 */
function formatDeviceTypeForUi(raw: string | undefined | null): string {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return '—';
  const s = t.toLowerCase();
  const map: Record<string, string> = {
    windows: 'Windows',
    mac: 'Mac',
    ios: 'iOS',
    android: 'Android',
  };
  if (map[s]) return map[s];
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
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
  const c = data.binding_code;
  if (typeof c === 'string' && c.trim()) return c.trim();
  return null;
}

/** API 偶发返回嵌套对象时用具体字段，避免出现 [object Object] */
function coerceApiStringField(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (isPlainObjectRecord(v)) {
    for (const key of ['name', 'label', 'value', 'text', 'displayName'] as const) {
      const inner = v[key];
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
      if (typeof inner === 'number' && Number.isFinite(inner)) return String(inner);
    }
  }
  return '';
}

function parseDevicesListPayload(data: unknown): ApiDeviceRow[] {
  const rows: ApiDeviceRow[] = [];
  let arr: unknown[] = [];
  if (isPlainObjectRecord(data)) {
    const list = data.devices;
    if (Array.isArray(list)) arr = list;
  }
  for (const item of arr) {
    if (!isPlainObjectRecord(item)) continue;
    const id = item.device_id;
    if (typeof id !== 'string' || !id.trim()) continue;
    const deviceNameStr = coerceApiStringField(item.device_name);
    const deviceTypeStr = coerceApiStringField(item.device_type);
    const la = item.last_active_at ?? item['last_seen_at'];
    let lastAt: number | null = null;
    if (typeof la === 'number' && Number.isFinite(la)) lastAt = la;
    else if (typeof la === 'string' && la.trim() !== '') {
      const n = Number(la);
      if (Number.isFinite(n)) lastAt = n;
    }
    rows.push({
      device_id: id.trim(),
      device_name: deviceNameStr,
      device_type: deviceTypeStr,
      last_active_at: lastAt,
    });
  }
  return rows;
}

function isDeviceRevokedError(err: unknown): boolean {
  if (!isHttpRequestError(err)) return false;
  const data = err.responseData;
  if (isPlainObjectRecord(data) && typeof data.error === 'string') {
    return data.error === 'DEVICE_REVOKED';
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
  if (!isHttpRequestError(err)) return false;
  if (err.code === 'ETIMEDOUT' || err.code === 'ENETWORK') return true;
  if (typeof err.message === 'string' && /timeout/i.test(err.message)) return true;
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

function parsePartialSettingsData(raw: unknown): Partial<SyncPluginSettings> {
  if (!isPlainObjectRecord(raw)) return {};
  const out: Partial<SyncPluginSettings> = {};
  if (typeof raw.serverUrl === 'string') out.serverUrl = raw.serverUrl;
  if (typeof raw.enableSync === 'boolean') out.enableSync = raw.enableSync;
  return out;
}

/** 最近同步时间等：3 秒前、2 分钟前 */
function formatRelativeTimeShort(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 0) return '刚刚';
  if (sec < 10) return '刚刚';
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const d = new Date(ts);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return `昨天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return d.toLocaleString();
}

/** 设备最近活跃：刚刚、2 分钟前、昨天 21:30 */
function formatDeviceLastActive(ts: number): string {
  return formatRelativeTimeShort(ts);
}

/** 常见上传接口英文短语 → 中文（用于 /upload 等返回体） */
function humanizeKnownUploadErrorText(raw: string): string {
  const t = raw.trim();
  const l = t.toLowerCase();
  if (l.includes('file required')) {
    return '上传失败：缺少文件（表单字段 file 必填）';
  }
  if (l.includes('path required') || l.includes('relative_path')) {
    return '上传失败：缺少路径（表单字段 relative_path 必填）';
  }
  if (l.includes('invalid upload')) {
    return '上传失败：无效的上传（请检查 file、relative_path、cipher_hash、updated_at 等字段）';
  }
  return t;
}

/** 拒绝把 JSON 下载链接或非标 body 当密文写入 vault */
/** 下载体在部分环境下可能为 TypedArray，统一为独立 ArrayBuffer */
function httpResponseBodyToArrayBuffer(data: unknown): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const v = data;
    const copy = new Uint8Array(v.byteLength);
    copy.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    return copy.buffer;
  }
  throw new Error('下载响应 body 无法转为 ArrayBuffer');
}

function assertDownloadWireResponse(
  data: ArrayBuffer,
  contentType: string | undefined,
): void {
  const head = new Uint8Array(data.byteLength === 0 ? data : data.slice(0, Math.min(400, data.byteLength)));
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('application/json')) {
    throw new Error('下载 Content-Type 为 application/json，期望 application/octet-stream 密文');
  }
  if (ct.includes('text/')) {
    const s = new TextDecoder('utf-8', { fatal: false }).decode(head);
    if (s.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(s.trim()) as unknown;
        if (isPlainObjectRecord(parsed)) {
          const urlKeys = ['url', 'downloadUrl', 'signedUrl', 'download_url', 'fileUrl'] as const;
          for (const k of urlKeys) {
            const v = parsed[k];
            if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
              throw new Error('服务端返回 JSON 链接而非密文');
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('服务端返回')) throw e;
      }
    }
  }
  if (data.byteLength < 5) throw new Error('下载密文过短');
  const magic = [0x48, 0x53, 0x59, 0x4e, 0x01];
  for (let i = 0; i < 5; i++) {
    if (head[i] !== magic[i]) throw new Error('下载体不是有效密文 wire（魔数不匹配）');
  }
}

/** 常规 API 超时；大文件传输单独放宽，避免误杀上传/下载 */
const HTTP_TIMEOUT_MS = 12_000;
const HTTP_TRANSFER_TIMEOUT_MS = 120_000;

function formatSyncError(err: unknown): string {
  if (isHttpRequestError(err)) {
    if (err.status === 413) {
      return '文件过大，已超过服务端允许的大小限制';
    }
    if (err.status === 404) {
      return '资源不存在 (HTTP 404)';
    }
    const data = err.responseData;
    if (data instanceof ArrayBuffer && data.byteLength > 0 && data.byteLength <= 4096) {
      const s = new TextDecoder('utf-8', { fatal: false }).decode(data);
      const t = s.trim();
      if (t.startsWith('{')) {
        try {
          const parsed = JSON.parse(t) as unknown;
          if (isPlainObjectRecord(parsed)) {
            const msg = parsed.message;
            if (typeof msg === 'string' && msg.trim()) return humanizeKnownUploadErrorText(msg.trim());
            const errMsg = parsed.error;
            if (typeof errMsg === 'string' && errMsg.trim())
              return humanizeKnownUploadErrorText(errMsg.trim());
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (typeof data === 'string' && data.trim()) {
      const s = data.trim();
      try {
        const parsed = JSON.parse(s) as unknown;
        if (isPlainObjectRecord(parsed)) {
          const msg = parsed.message;
          if (typeof msg === 'string' && msg.trim())
            return humanizeKnownUploadErrorText(msg.trim());
          const errMsg = parsed.error;
          if (typeof errMsg === 'string' && errMsg.trim())
            return humanizeKnownUploadErrorText(errMsg.trim());
        }
      } catch {
        /* 非 JSON 字符串 */
      }
      if (s.length <= 200) return humanizeKnownUploadErrorText(s);
    }
    if (isPlainObjectRecord(data)) {
      const msg = data.message;
      if (typeof msg === 'string' && msg.trim())
        return humanizeKnownUploadErrorText(msg.trim());
      const errMsg = data.error;
      if (typeof errMsg === 'string' && errMsg.trim())
        return humanizeKnownUploadErrorText(errMsg.trim());
    }
    const parts: string[] = [];
    if (err.code) parts.push(err.code);
    if (err.status != null) parts.push(`HTTP ${err.status}`);
    if (err.message) parts.push(err.message);
    return parts.length > 0 ? parts.join(' · ') : '网络请求失败';
  }
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

class PromptModal extends Modal {
  constructor(
    app: App,
    private readonly message: string,
    private readonly onAccept: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('p', { text: this.message });
    const btns = contentEl.createDiv({ cls: 'modal-button-container' });
    btns.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
    btns
      .createEl('button', { text: '确定', cls: 'mod-cta' })
      .addEventListener('click', () => {
        this.close();
        this.onAccept();
      });
  }
}

class HailySyncSettingTab extends PluginSettingTab {
  plugin: ObsidianSyncPlugin;

  private maskedBindingText = '';
  private revealedFullCode: string | null = null;
  private revealExpireAt: number | null = null;
  private bindingError: string | null = null;
  private bindingCopyFeedback: string | null = null;
  private bindingPanelEl: HTMLElement | null = null;
  private bindingCountdownInterval: number | null = null;
  private bindingHideTimeout: number | null = null;
  private bindingCopyFeedbackTimeout: number | null = null;
  private deviceListEl: HTMLElement | null = null;
  private devices: ApiDeviceRow[] = [];
  private devicesError: string | null = null;
  private devicesLoading = false;
  /** 点击「显示」后的提示文案 */
  private revealHint: string | null = null;
  private syncStatusTicker: number | null = null;
  private syncStatusContainerEl: HTMLElement | null = null;
  private debugIdentityEl: HTMLElement | null = null;

  constructor(app: App, plugin: ObsidianSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.plugin.register(() => this.clearBindingTimers());
    this.plugin.register(() => this.clearSyncStatusTicker());
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

  private clearSyncStatusTicker(): void {
    if (this.syncStatusTicker != null) {
      window.clearInterval(this.syncStatusTicker);
      this.syncStatusTicker = null;
    }
  }

  hide(): void {
    this.clearSyncStatusTicker();
    this.syncStatusContainerEl = null;
    this.debugIdentityEl = null;
  }

  private fillDebugIdentity(): void {
    const el = this.debugIdentityEl;
    if (!el) return;
    el.empty();
    el.createEl('div', {
      cls: 'setting-item-description',
      text: `用户 ID：${this.plugin.userId || '—'}`,
    });
    el.createEl('div', {
      cls: 'setting-item-description',
      text: `设备 ID：${this.plugin.deviceId || '—'}`,
    });
    el.createEl('div', {
      cls: 'setting-item-description',
      text: `当前服务器地址：${this.plugin.baseUrl || '—'}`,
    });
  }

  private refreshSyncStatusPanel(): void {
    if (this.syncStatusContainerEl) this.fillSyncStatusSection(this.syncStatusContainerEl);
  }

  private fillSyncStatusSection(el: HTMLElement): void {
    el.empty();
    const wasRevoked = this.plugin.wasRevoked;
    const syncing = this.plugin.isSyncing;
    const st = this.plugin.connectionState;

    if (wasRevoked) {
      el.createEl('div', {
        cls: 'vault-sync-status-line',
        text: '当前设备已被移除 · 请在下方「绑定新设备」中输入设备绑定码以恢复同步。',
      });
      return;
    }

    if (st === 'awaiting_bind') {
      el.createEl('div', {
        cls: 'vault-sync-status-line',
        text: '未连接 · 请输入设备绑定码以连接并开始同步。',
      });
      return;
    }

    if (st === 'initializing') {
      el.createEl('div', { cls: 'vault-sync-status-line', text: '正在初始化…' });
      return;
    }

    if (!this.plugin.deviceId) {
      el.createEl('div', {
        cls: 'vault-sync-status-line',
        text: '未连接 · 完成设备绑定后即可开始同步。',
      });
      return;
    }

    if (syncing) {
      const tail =
        this.plugin.lastSyncAt != null
          ? `最近同步：${formatRelativeTimeShort(this.plugin.lastSyncAt)}`
          : '尚未同步';
      el.createEl('div', { cls: 'vault-sync-status-line', text: `正在同步… · ${tail}` });
      return;
    }

    if (this.plugin.lastSyncError) {
      let line = '同步失败，请检查网络后重试';
      if (this.plugin.lastSyncAt != null) {
        line += ` · 最近同步：${formatRelativeTimeShort(this.plugin.lastSyncAt)}`;
      }
      el.createEl('div', { cls: 'vault-sync-status-line', text: line });
      return;
    }

    if (this.devicesLoading) {
      el.createEl('div', { cls: 'vault-sync-status-line', text: '正在加载设备信息…' });
      return;
    }

    const syncTail =
      this.plugin.lastSyncAt != null
        ? `最近同步：${formatRelativeTimeShort(this.plugin.lastSyncAt)}`
        : '尚未同步';
    el.createEl('div', {
      cls: 'vault-sync-status-line',
      text: `同步运行正常 · ${syncTail}`,
    });

    if (this.devices.length < 2) {
      el.createEl('div', {
        cls: 'vault-sync-guide-sub',
        text: '在另一台设备打开本插件并输入设备绑定码，即可添加设备。',
      });
      const btnRow = el.createDiv({ cls: 'vault-sync-guide-actions' });
      const btn = btnRow.createEl('button', {
        cls: 'mod-cta',
        text: '复制设备绑定码',
      });
      btn.type = 'button';
      btn.addEventListener('click', () => {
        void this.copyFullBindingCode();
      });
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
      this.revealHint = null;
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

    if (this.revealHint) {
      panel.createEl('div', {
        cls: 'setting-item-description vault-sync-binding-reveal-hint',
        text: this.revealHint,
      });
    }

    this.syncRevealExpiry();

    if (
      this.revealedFullCode &&
      this.revealExpireAt != null &&
      Date.now() < this.revealExpireAt
    ) {
      const row = panel.createDiv({ cls: 'vault-sync-binding-code-row' });
      row.createSpan({ cls: 'vault-sync-binding-code-label', text: '完整绑定码' });
      row.createSpan({
        cls: 'vault-sync-binding-code vault-sync-binding-code-full',
        text: this.revealedFullCode,
      });
      const sec = Math.max(0, Math.ceil((this.revealExpireAt - Date.now()) / 1000));
      row.createSpan({
        cls: 'vault-sync-binding-countdown',
        text: `（${sec} 秒后自动隐藏）`,
      });
    } else {
      const maskedWrap = panel.createDiv({ cls: 'vault-sync-binding-masked-wrap' });
      maskedWrap.createSpan({ cls: 'vault-sync-binding-code-label', text: '设备绑定码' });
      maskedWrap.createDiv({
        cls: 'vault-sync-binding-code vault-sync-binding-code-masked',
        text: this.maskedBindingText || '—',
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
      this.revealHint = null;
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
      new Notice('请先完成连接后再试');
      return;
    }
    this.clearBindingTimers();
    this.bindingError = null;
    const code = await this.plugin.fetchBindingCodeRaw();
    if (!code) {
      this.bindingError = '暂时无法获取绑定码，请检查网络后重试';
      this.renderBindingPanel();
      return;
    }
    this.revealedFullCode = code;
    this.revealExpireAt = Date.now() + BINDING_CODE_SHOW_MS;
    this.revealHint = '正在显示完整绑定码，20 秒后自动隐藏';
    this.renderBindingPanel();
    this.scheduleRevealHide();
  }

  private async copyFullBindingCode(): Promise<void> {
    if (!this.plugin.deviceId) {
      new Notice('请先完成连接后再试');
      return;
    }
    const code = await this.plugin.fetchBindingCodeRaw();
    if (!code) {
      this.bindingError = '暂时无法获取绑定码，请检查网络后重试';
      this.renderBindingPanel();
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      new Notice('已复制到剪贴板');
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
      this.bindingError = '连接失败，请检查网络';
      this.renderBindingPanel();
    }
  }

  private async onResetBinding(): Promise<void> {
    if (!this.plugin.deviceId) {
      new Notice('请先完成连接后再试');
      return;
    }
    new PromptModal(
      this.app,
      '重置后，旧的设备绑定码将立即失效，其他设备需使用新绑定码才能继续连接。\n\n确定要重置吗？',
      () => {
        void this.runAfterResetBindingAccepted();
      },
    ).open();
  }

  private async runAfterResetBindingAccepted(): Promise<void> {
    this.clearBindingTimers();
    this.revealedFullCode = null;
    this.revealExpireAt = null;
    this.bindingError = null;
    const ok = await this.plugin.resetBindingCodeOnServer();
    if (ok) {
      await this.refreshBindingMaskOnly();
      new Notice('操作已完成');
    } else {
      this.bindingError = '同步失败，请检查网络后重试';
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
        text: '暂无其他设备连接',
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
      wrap.createEl('div', { cls: 'setting-item-description', text: '暂无其他设备连接' });
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
    const sorted = [...this.devices].sort((a, b) => {
      const cur = this.plugin.deviceId;
      if (a.device_id === cur) return -1;
      if (b.device_id === cur) return 1;
      return 0;
    });
    for (const d of sorted) {
      const isCurrent = d.device_id === this.plugin.deviceId;
      const tr = tbody.createEl('tr', {
        cls: isCurrent ? 'vault-sync-device-row-current' : undefined,
      });
      const nameCell = tr.createEl('td');
      nameCell.appendText(d.device_name || '未命名设备');
      if (isCurrent) {
        nameCell.appendText(' ');
        nameCell.createSpan({ cls: 'vault-sync-badge-current', text: '当前设备' });
      }
      tr.createEl('td', { text: formatDeviceTypeForUi(d.device_type) });
      const last =
        d.last_active_at != null && Number.isFinite(d.last_active_at)
          ? formatDeviceLastActive(d.last_active_at)
          : '暂无记录';
      tr.createEl('td', { text: last });
      const tdOp = tr.createEl('td');
      if (!isCurrent) {
        const btn = tdOp.createEl('button', { cls: 'vault-sync-binding-copy-btn', text: '删除' });
        btn.type = 'button';
        btn.addEventListener('click', () => {
          const label = (d.device_name || '该设备').trim() || '该设备';
          new PromptModal(
            this.app,
            `移除后，该设备将无法继续同步，需重新输入设备绑定码才能连接。\n\n确定移除「${label}」吗？`,
            () => {
              void this.plugin.deleteDeviceOnServer(d.device_id).then((ok) => {
                if (ok) void this.reloadDevices();
              });
            },
          ).open();
        });
      } else {
        tdOp.createSpan({ cls: 'setting-item-description', text: '不可移除' });
      }
    }
    if (sorted.length === 1) {
      wrap.createEl('div', {
        cls: 'setting-item-description',
        text: '当前仅此设备',
      });
    }
  }

  private async reloadDevices(): Promise<void> {
    if (!this.plugin.deviceId) {
      this.devices = [];
      this.renderDeviceList();
      this.refreshSyncStatusPanel();
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
    this.refreshSyncStatusPanel();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.clearBindingTimers();
    this.clearSyncStatusTicker();
    this.bindingPanelEl = null;
    this.deviceListEl = null;
    this.bindingCopyFeedback = null;
    this.revealedFullCode = null;
    this.revealExpireAt = null;
    this.bindingError = null;
    this.devicesError = null;
    this.revealHint = null;
    this.syncStatusContainerEl = null;
    this.debugIdentityEl = null;

    const container = containerEl.createDiv({ cls: 'hailysync-container' });

    new Setting(container).setName('海狸同步 HailySync').setHeading();

    const syncWrap = container.createDiv({
      cls: 'hailysync-card vault-sync-section vault-sync-sync-status-section',
    });
    syncWrap.createEl('div', { cls: 'vault-sync-section-label', text: '同步状态' });
    this.syncStatusContainerEl = syncWrap.createDiv({ cls: 'vault-sync-sync-status' });
    this.fillSyncStatusSection(this.syncStatusContainerEl);

    this.syncStatusTicker = window.setInterval(() => {
      this.refreshSyncStatusPanel();
    }, 1000);

    const bindingBlock = container.createDiv({
      cls: 'hailysync-card vault-sync-binding-card',
    });
    new Setting(bindingBlock)
      .setName('设备绑定码（用于连接新设备，请妥善保存）')
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
        btn.setButtonText('重置').setWarning().onClick(() => {
          void this.onResetBinding();
        }),
      );
    this.bindingPanelEl = bindingBlock.createDiv({ cls: 'vault-sync-binding-panel' });
    this.renderBindingPanel();

    let bindingInput: HTMLInputElement | null = null;
    const bindNewBlock = container.createDiv({
      cls: 'hailysync-card vault-sync-section vault-sync-bind-block',
    });
    new Setting(bindNewBlock)
      .setName('绑定新设备')
      .setDesc('输入设备绑定码即可连接')
      .addText((text) => {
        bindingInput = text.inputEl;
        text.setPlaceholder('输入设备绑定码');
      })
      .addButton((btn) => {
        btn.setButtonText('连接设备');
        const syncConnectButtonState = () => {
          const has = !!(bindingInput?.value?.trim());
          if (btn.buttonEl.textContent === '连接中…') return;
          btn.setDisabled(!has);
        };
        bindingInput?.addEventListener('input', syncConnectButtonState);
        syncConnectButtonState();
        btn.onClick(() => {
          const code = bindingInput?.value?.trim() ?? '';
          if (!code) return;
          void (async () => {
            let reopened = false;
            btn.setButtonText('连接中…');
            btn.setDisabled(true);
            try {
              const ok = await this.plugin.bindWithCode(code);
              if (ok) {
                reopened = true;
                this.display();
              }
            } finally {
              if (!reopened) {
                btn.setButtonText('连接设备');
                syncConnectButtonState();
              }
            }
          })();
        });
      });

    const devBlock = container.createDiv({
      cls: 'hailysync-card vault-sync-devices-block vault-sync-section',
    });
    new Setting(devBlock)
      .setName('已绑定设备')
      .setDesc('当前设备不可移除')
      .addButton((btn) => {
        btn.buttonEl.classList.add('mod-muted');
        btn.setButtonText('刷新列表').onClick(() => {
          void this.reloadDevices();
        });
      });
    this.deviceListEl = devBlock.createDiv({ cls: 'vault-sync-device-list' });
    this.renderDeviceList();

    const autoSyncCard = container.createDiv({ cls: 'hailysync-card' });
    new Setting(autoSyncCard)
      .setName('自动同步（推荐开启）')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableSync).onChange(async (value) => {
          this.plugin.settings.enableSync = value;
          await this.plugin.saveSettings();
        }),
      );

    const manualSyncCard = container.createDiv({ cls: 'hailysync-card' });
    new Setting(manualSyncCard)
      .setName('手动同步')
      .setDesc('立即执行一次同步')
      .addButton((btn) => {
        btn.setButtonText('立即同步');
        btn.onClick(() => {
          void (async () => {
            if (this.plugin.isSyncing) {
              new Notice('请稍候，上一同步尚未结束');
              return;
            }
            const idleLabel = '立即同步';
            btn.setButtonText('正在同步…');
            btn.setDisabled(true);
            try {
              await this.plugin.syncNow();
            } finally {
              btn.setDisabled(false);
              if (this.plugin.lastSyncError) {
                btn.setButtonText(idleLabel);
              } else {
                btn.setButtonText('同步完成');
                window.setTimeout(() => {
                  btn.setButtonText(idleLabel);
                }, 1000);
              }
            }
          })();
        });
      });

    const advanced = container.createEl('details', { cls: 'vault-sync-advanced' });
    advanced.createEl('summary', { text: '高级设置' });
    const advBody = advanced.createDiv({ cls: 'vault-sync-advanced-body' });
    new Setting(advBody)
      .setName('服务器地址')
      .setDesc('留空将使用默认服务器\n仅在需要时修改')
      .addText((text) =>
        text
          .setPlaceholder(BUILTIN_DEFAULT_SERVER_URL)
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim() || BUILTIN_DEFAULT_SERVER_URL;
            await this.plugin.saveSettings();
          }),
      );

    const debugDetails = advBody.createEl('details', { cls: 'vault-sync-debug-details' });
    debugDetails.createEl('summary', { text: '连接信息（用户 ID、设备 ID、服务器）' });
    this.debugIdentityEl = debugDetails.createDiv({ cls: 'vault-sync-debug-identity' });
    debugDetails.addEventListener('toggle', () => {
      if (debugDetails.open) {
        this.fillDebugIdentity();
      }
    });

    void this.plugin.ensureDeviceIdentity().then(async () => {
      this.refreshSyncStatusPanel();

      if (this.plugin.connectionState === 'connected' && this.plugin.deviceId) {
        await this.refreshBindingMaskOnly();
        this.renderBindingPanel();
        void this.reloadDevices();
      }
    });
  }
}

const SYNC_STATUS_RESULT_MS = 3500;
/** 单次同步结束后最短间隔，缓和定时器与手动触发的竞态 */
const SYNC_COOLDOWN_MS = 2000;
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
  /** 内存中的 vault 密钥（32B），来自 .sync_crypto.json 或绑定解密 */
  vaultKey: Uint8Array | null = null;
  vaultKeyVersion = 1;
  /** 最近一次成功完成同步的时间（用于设置页展示） */
  lastSyncAt: number | null = null;
  /** 最近一次同步失败原因（成功同步后清空） */
  lastSyncError: string | null = null;
  private syncRunning = false;
  /** 自动同步与手动同步紧挨着结束时，短暂冷却避免并发重叠 */
  private syncCooldownUntil = 0;

  get isSyncing(): boolean {
    return this.syncRunning;
  }
  private statusBarItem: HTMLElement | null = null;
  private statusResultTimer: number | null = null;
  private autoSyncStartupTimerId: number | null = null;

  async onload() {
    try {
      await this.loadSettings();
      await this.ensureDeviceIdentity();
    } catch (e) {
      console.error('[HailySync] onload init failed', e);
      try {
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
      } catch {
        /* ignore */
      }
      this.connectionState = 'awaiting_bind';
      this.userId = '';
      this.deviceId = '';
    }

    try {
      this.initSyncStatusBar();
    } catch (e) {
      console.error('[HailySync] status bar init failed', e);
    }

    try {
      this.addSettingTab(new HailySyncSettingTab(this.app, this));
    } catch (e) {
      console.error('[HailySync] addSettingTab failed', e);
    }

    try {
      this.addCommand({
        id: 'sync-now',
        name: '立即同步',
        callback: () => {
          void this.syncNow();
        },
      });
    } catch (e) {
      console.error('[HailySync] addCommand failed', e);
    }

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
    this.setSyncStatusText('同步运行正常');
  }

  private setSyncStatusSyncing(): void {
    this.clearStatusResultTimer();
    this.setSyncStatusText('正在同步…');
  }

  private setSyncStatusSuccess(): void {
    this.clearStatusResultTimer();
    this.setSyncStatusText('同步完成');
    this.statusResultTimer = window.setTimeout(() => {
      this.statusResultTimer = null;
      this.setSyncStatusIdle();
    }, SYNC_STATUS_RESULT_MS);
  }

  private setSyncStatusFailed(): void {
    this.clearStatusResultTimer();
    this.setSyncStatusText('同步失败，请检查网络后重试');
    this.statusResultTimer = window.setTimeout(() => {
      this.statusResultTimer = null;
      this.setSyncStatusIdle();
    }, SYNC_STATUS_RESULT_MS);
  }

  async loadSettings() {
    let loaded: Partial<SyncPluginSettings> = {};
    try {
      loaded = parsePartialSettingsData(await this.loadData());
    } catch (e) {
      console.error('[HailySync] loadData failed', e);
    }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
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
    const raw = this.settings?.serverUrl;
    const s = typeof raw === 'string' ? raw.trim() : '';
    const u = s || BUILTIN_DEFAULT_SERVER_URL;
    return u.replace(/\/+$/, '');
  }

  /** 除 POST /api/init、POST /api/bind 外所有 sync API 使用 */
  private syncApiHeaders(): Record<string, string> {
    const id = typeof this.deviceId === 'string' ? this.deviceId.trim() : '';
    if (!id) return {};
    return {
      'X-Device-Id': id,
      'X-HailySync-Protocol': '1',
    };
  }

  private async persistVaultKeyLocal(vaultKey: Uint8Array, vaultKeyVersion: number): Promise<void> {
    if (vaultKey.length !== 32) throw new Error('E2EE_VAULT_KEY_LEN');
    this.vaultKey = vaultKey;
    this.vaultKeyVersion = vaultKeyVersion;
    await this.app.vault.adapter.write(
      SYNC_CRYPTO_FILENAME,
      JSON.stringify(
        {
          vault_key_b64u: bytesToBase64url(vaultKey),
          vault_key_version: vaultKeyVersion,
        } satisfies SyncCryptoLocalFile,
        null,
        2,
      ),
    );
  }

  private async wipeVaultKeyLocal(): Promise<void> {
    this.vaultKey = null;
    this.vaultKeyVersion = 1;
    try {
      const exists = this.app.vault.getAbstractFileByPath(SYNC_CRYPTO_FILENAME);
      if (exists instanceof TFile) await this.app.fileManager.trashFile(exists);
    } catch {
      /* ignore */
    }
  }

  private assertBindEnvelopeMatchesRoot(data: {
    kek_salt: string;
    kek_derivation_version: number;
    vault_key_version: number;
    envelope: unknown;
  }): void {
    assertEnvelopeShape(data.envelope);
    const env = data.envelope;
    if (env.kek_salt !== data.kek_salt) throw new Error('E2EE_BIND_KEK_SALT_MISMATCH');
    if (env.kek_derivation_version !== data.kek_derivation_version) {
      throw new Error('E2EE_BIND_KEK_DERIVATION_MISMATCH');
    }
    if (env.vault_key_version !== data.vault_key_version) {
      throw new Error('E2EE_BIND_VAULT_KEY_VERSION_MISMATCH');
    }
    if (env.envelope_version !== 1) throw new Error('E2EE_BIND_ENVELOPE_VERSION');
    if (env.algorithm !== 'AES-256-GCM') throw new Error('E2EE_BIND_ENVELOPE_ALGORITHM');
  }

  /** 首设备：用 init 返回的 binding_code 派生 KEK、PUT envelope、落盘 vault_key */
  private async bootstrapVaultFromInit(bindingCodeRaw: string | undefined): Promise<void> {
    if (typeof bindingCodeRaw !== 'string' || !bindingCodeRaw.trim()) {
      throw new Error('E2EE_INIT_MISSING_BINDING_CODE');
    }
    const normalized = normalizeBindingCode(bindingCodeRaw);
    const salt = randomBytes(16);
    const kekDerivationVersion = 1;
    const vaultKeyVersion = 1;
    const vaultKey = randomBytes(32);
    const kek = await deriveKek(normalized, salt, kekDerivationVersion);
    const envelope = await wrapVaultKeyToEnvelope(
      vaultKey,
      kek,
      kekDerivationVersion,
      salt,
      vaultKeyVersion,
    );
    const putEnv = await syncHttpRequest({
      url: `${this.baseUrl}/api/vault/envelope`,
      method: 'PUT',
      headers: this.syncApiHeaders(),
      contentType: 'application/json',
      body: JSON.stringify(envelope),
      timeoutMs: HTTP_TRANSFER_TIMEOUT_MS,
    });
    if (putEnv.status >= 400) throw httpErrorFromResponse(putEnv);
    await this.persistVaultKeyLocal(vaultKey, vaultKeyVersion);
  }

  private async unlockVaultFromBindingCode(
    bindingCodeRaw: string,
    envelope: VaultEnvelopeJson,
  ): Promise<void> {
    const vaultKey = await unwrapVaultKeyFromEnvelope(
      envelope,
      normalizeBindingCode(bindingCodeRaw),
    );
    await this.persistVaultKeyLocal(vaultKey, envelope.vault_key_version);
  }

  /** GET /api/vault/envelope（与冻结协议字段一致） */
  async fetchVaultEnvelope(): Promise<VaultEnvelopeJson> {
    const res = await syncHttpRequest({
      url: `${this.baseUrl}/api/vault/envelope`,
      headers: this.syncApiHeaders(),
      timeoutMs: HTTP_TIMEOUT_MS,
    });
    if (res.status >= 400) throw httpErrorFromResponse(res);
    let data: unknown;
    try {
      data = JSON.parse(res.text) as unknown;
    } catch {
      throw new Error('GET /api/vault/envelope 响应非法');
    }
    if (!isPlainObjectRecord(data)) {
      throw new Error('GET /api/vault/envelope 响应非法');
    }
    assertEnvelopeShape(data);
    return data;
  }

  /** 404 → null；其余错误原样抛出（含 DEVICE_REVOKED） */
  private async fetchVaultEnvelopeOrNotFound(): Promise<VaultEnvelopeJson | null> {
    try {
      return await this.fetchVaultEnvelope();
    } catch (e) {
      if (isDeviceRevokedError(e)) throw e;
      if (isHttpRequestError(e) && e.status === 404) return null;
      throw e;
    }
  }

  private async readBindingCodeFromConfigFile(): Promise<string | null> {
    try {
      const raw = await this.app.vault.adapter.read(SYNC_CONFIG_FILENAME);
      const p = JSON.parse(raw || '{}') as unknown;
      if (!isPlainObjectRecord(p)) return null;
      const c = p.binding_code;
      if (typeof c === 'string' && c.trim()) return c.trim();
    } catch {
      /* ignore */
    }
    return null;
  }

  /** 同步/上传/下载前：内存或 .sync_crypto → 必要时 GET envelope + 绑定码恢复，或 404 时用绑定码首包 PUT */
  async ensureVaultCryptoForSync(): Promise<void> {
    if (this.vaultKey != null && this.vaultKey.length === 32) return;

    let raw: string;
    try {
      raw = await this.app.vault.adapter.read(SYNC_CRYPTO_FILENAME);
      let p: unknown;
      try {
        p = JSON.parse(raw || '{}') as unknown;
      } catch {
        throw new Error('E2EE_CRYPTO_FILE_CORRUPT');
      }
      if (!isPlainObjectRecord(p)) throw new Error('E2EE_CRYPTO_FILE_CORRUPT');
      const kb = p.vault_key_b64u;
      const vv = p.vault_key_version;
      if (typeof kb !== 'string' || typeof vv !== 'number' || !Number.isFinite(vv)) {
        throw new Error('E2EE_CRYPTO_FILE_CORRUPT');
      }
      this.vaultKey = base64urlToBytes(kb);
      this.vaultKeyVersion = vv;
      if (this.vaultKey.length !== 32) throw new Error('E2EE_CRYPTO_FILE_CORRUPT');
      return;
    } catch (e) {
      if (e instanceof Error && e.message === 'E2EE_CRYPTO_FILE_CORRUPT') throw e;
      /* 无文件或其它读盘错误 → 走恢复 */
    }

    if (!this.deviceId) {
      throw new Error('E2EE_NEED_DEVICE');
    }

    const bindingFromDisk = await this.readBindingCodeFromConfigFile();

    let envelope: VaultEnvelopeJson | null;
    try {
      envelope = await this.fetchVaultEnvelopeOrNotFound();
    } catch (e) {
      if (isDeviceRevokedError(e)) await this.handleDeviceRevoked();
      throw e;
    }
    if (envelope !== null) {
      if (!bindingFromDisk) {
        throw new Error('E2EE_NEED_BINDING_CODE');
      }
      await this.unlockVaultFromBindingCode(bindingFromDisk, envelope);
      return;
    }

    if (bindingFromDisk) {
      await this.bootstrapVaultFromInit(bindingFromDisk);
      return;
    }

    throw new Error('E2EE_NEED_FIRST_SETUP');
  }

  async ensureVaultKeyLoaded(): Promise<void> {
    await this.ensureVaultCryptoForSync();
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
        new Notice('请先输入设备绑定码', 12000);
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
      new Notice('连接失败，请检查网络');
      return;
    }
    try {
      const res = await syncHttpRequest({
        url: `${server}/api/init`,
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({
          device_name: getDeviceDisplayName(),
          device_type: getDeviceTypeLabel(),
        }),
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      if (res.status >= 400) throw httpErrorFromResponse(res);
      let payload: unknown;
      try {
        payload = JSON.parse(res.text) as unknown;
      } catch {
        throw httpErrorFromResponse(res);
      }
      if (!isPlainObjectRecord(payload)) {
        this.connectionState = 'awaiting_bind';
        new Notice('同步失败，请检查网络后重试');
        return;
      }
      const uid = payload.user_id;
      const did = payload.device_id;
      const bindingCode = payload.binding_code;
      if (typeof uid !== 'string' || !uid.trim() || typeof did !== 'string' || !did.trim()) {
        this.connectionState = 'awaiting_bind';
        new Notice('同步失败，请检查网络后重试');
        return;
      }
      if (typeof bindingCode !== 'string' || !bindingCode.trim()) {
        this.connectionState = 'awaiting_bind';
        new Notice('同步失败，请检查网络后重试');
        return;
      }
      try {
        await this.persistFullIdentity(uid.trim(), did.trim(), bindingCode.trim());
        await this.bootstrapVaultFromInit(bindingCode);
      } catch {
        await this.wipeVaultKeyLocal();
        this.userId = '';
        this.deviceId = '';
        this.connectionState = 'awaiting_bind';
        await this.app.vault.adapter.write(
          SYNC_CONFIG_FILENAME,
          JSON.stringify({ pending_bind: true } satisfies SyncIdentityConfig, null, 2),
        );
        new Notice('同步失败，请检查网络后重试', 12000);
        return;
      }
    } catch (e) {
      this.connectionState = 'awaiting_bind';
      if (isNetworkError(e)) {
        new Notice('连接失败，请检查网络');
      } else {
        new Notice('同步失败，请检查网络后重试');
      }
    }
  }

  /**
   * @param bindingCodeToStore 非空则写入/覆盖 config 内 binding_code；省略则保留盘中已有 binding_code
   */
  private async persistFullIdentity(
    userId: string,
    deviceId: string,
    bindingCodeToStore?: string,
  ): Promise<void> {
    let existingBinding: string | undefined;
    try {
      const raw = await this.app.vault.adapter.read(SYNC_CONFIG_FILENAME);
      const p = JSON.parse(raw || '{}') as unknown;
      if (isPlainObjectRecord(p) && typeof p.binding_code === 'string' && p.binding_code.trim()) {
        existingBinding = p.binding_code.trim();
      }
    } catch {
      /* ignore */
    }

    const storeBinding =
      bindingCodeToStore !== undefined && bindingCodeToStore.trim() !== ''
        ? bindingCodeToStore.trim()
        : existingBinding;

    this.userId = userId.trim();
    this.deviceId = deviceId.trim();
    this.connectionState = 'connected';
    this.wasRevoked = false;

    const out: SyncIdentityConfig = {
      user_id: this.userId,
      device_id: this.deviceId,
    };
    if (storeBinding) out.binding_code = storeBinding;

    await this.app.vault.adapter.write(SYNC_CONFIG_FILENAME, JSON.stringify(out, null, 2));
  }

  async handleDeviceRevoked(): Promise<void> {
    await this.wipeVaultKeyLocal();
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
      const res = await syncHttpRequest({
        url: `${server}/api/binding-code`,
        headers: this.syncApiHeaders(),
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      if (res.status >= 400) throw httpErrorFromResponse(res);
      let data: unknown;
      try {
        data = JSON.parse(res.text) as unknown;
      } catch {
        return null;
      }
      return extractBindingCodeFromJson(data);
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new Notice('请重新输入设备绑定码以恢复连接', 12000);
        return null;
      }
      if (isNetworkError(e)) {
        new Notice('连接失败，请检查网络');
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
      const res = await syncHttpRequest({
        url: `${server}/api/binding-code/reset`,
        method: 'POST',
        headers: this.syncApiHeaders(),
        contentType: 'application/json',
        body: '{}',
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      if (res.status >= 400) throw httpErrorFromResponse(res);
      return true;
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new Notice('请重新输入设备绑定码以恢复连接', 12000);
        return false;
      }
      if (isNetworkError(e)) {
        new Notice('连接失败，请检查网络');
        return false;
      }
      return false;
    }
  }

  async fetchDevicesList(): Promise<
    { ok: true; devices: ApiDeviceRow[] } | { ok: false; message: string }
  > {
    if (!this.deviceId) return { ok: true, devices: [] };
    try {
      const res = await syncHttpRequest({
        url: `${this.baseUrl}/api/devices`,
        headers: this.syncApiHeaders(),
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      if (res.status >= 400) throw httpErrorFromResponse(res);
      let data: unknown;
      try {
        data = JSON.parse(res.text) as unknown;
      } catch {
        return { ok: true, devices: [] };
      }
      const devices = parseDevicesListPayload(data);
      return { ok: true, devices };
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        return { ok: false, message: '请重新输入设备绑定码以恢复连接' };
      }
      console.error('[HailySync] fetchDevicesList failed', e);
      /** 列表拉取失败：降级为空列表，不打断设置页（不触发 Notice） */
      return { ok: true, devices: [] };
    }
  }

  async deleteDeviceOnServer(targetId: string): Promise<boolean> {
    if (!this.deviceId) return false;
    const server = this.baseUrl;
    if (!server) return false;
    try {
      const res = await syncHttpRequest({
        url: `${server}/api/device/delete`,
        method: 'POST',
        headers: this.syncApiHeaders(),
        contentType: 'application/json',
        body: JSON.stringify({ device_id: targetId }),
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      if (res.status >= 400) throw httpErrorFromResponse(res);
      new Notice('操作已完成');
      return true;
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new Notice('请重新输入设备绑定码以恢复连接', 12000);
        return false;
      }
      if (isNetworkError(e)) {
        new Notice('连接失败，请检查网络');
        return false;
      }
      new Notice('同步失败，请检查网络后重试');
      return false;
    }
  }

  async bindWithCode(raw: string): Promise<boolean> {
    const code = raw.trim();
    if (!code) {
      new Notice('请先输入设备绑定码');
      return false;
    }
    const server = this.baseUrl;
    if (!server) {
      new Notice('连接失败，请检查网络', 6000);
      return false;
    }
    try {
      const res = await syncHttpRequest({
        url: `${server}/api/bind`,
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({
          binding_code: code,
          device_name: getDeviceDisplayName(),
          device_type: getDeviceTypeLabel(),
        }),
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      if (res.status >= 400) throw httpErrorFromResponse(res);
      let data: unknown;
      try {
        data = JSON.parse(res.text) as unknown;
      } catch {
        new Notice('设备绑定失败，请确认绑定码正确');
        return false;
      }
      if (!isPlainObjectRecord(data)) {
        new Notice('设备绑定失败，请确认绑定码正确');
        return false;
      }
      const uid = data.user_id;
      const did = data.device_id;
      const kekSalt = data.kek_salt;
      const kekDv = data.kek_derivation_version;
      const vkv = data.vault_key_version;
      const envelope = data.envelope;
      if (typeof uid !== 'string' || !uid.trim() || typeof did !== 'string' || !did.trim()) {
        new Notice('设备绑定失败，请确认绑定码正确', 6000);
        return false;
      }
      if (
        typeof kekSalt !== 'string' ||
        typeof kekDv !== 'number' ||
        typeof vkv !== 'number' ||
        envelope == null ||
        !isPlainObjectRecord(envelope)
      ) {
        new Notice('设备绑定失败，请确认绑定码正确', 8000);
        return false;
      }
      try {
        this.assertBindEnvelopeMatchesRoot({
          kek_salt: kekSalt,
          kek_derivation_version: kekDv,
          vault_key_version: vkv,
          envelope,
        });
        assertEnvelopeShape(envelope);
        await this.unlockVaultFromBindingCode(code, envelope);
      } catch (e) {
        console.error('[HailySync] bind unlock failed', e);
        new Notice('设备绑定失败，请确认绑定码正确', 12000);
        await this.wipeVaultKeyLocal();
        return false;
      }
      await this.persistFullIdentity(uid.trim(), did.trim(), code.trim());
      new Notice('设备连接成功，开始同步');
      void this.syncNow();
      return true;
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new Notice('请重新输入设备绑定码以恢复连接', 12000);
        return false;
      }
      if (isNetworkError(e)) {
        new Notice('连接失败，请检查网络');
        return false;
      }
      new Notice('设备绑定失败，请确认绑定码正确');
      return false;
    }
  }

  async loadMeta(): Promise<SyncMetaMap> {
    try {
      const content = await this.app.vault.adapter.read(SYNC_META_FILENAME);
      const parsed = JSON.parse(content || '{}') as unknown;
      if (isPlainObjectRecord(parsed)) {
        const out: SyncMetaMap = {};
        for (const [k, v] of Object.entries(parsed)) {
          const path = normalizeVaultPath(k);
          if (!isPlainObjectRecord(v)) continue;
          const rec = v;
          const ch = rec.cipher_hash;
          const cs = rec.cipher_size;
          out[path] = {
            cipher_hash: typeof ch === 'string' ? ch.toLowerCase() : null,
            cipher_size: typeof cs === 'number' ? cs : null,
            updated_at:
              typeof rec.updated_at === 'number' && Number.isFinite(rec.updated_at)
                ? rec.updated_at
                : Date.now(),
            deleted: rec.deleted === true,
            encryption_version:
              typeof rec.encryption_version === 'number'
                ? rec.encryption_version
                : ENCRYPTION_VERSION_WIRE,
            vault_key_version:
              typeof rec.vault_key_version === 'number' ? rec.vault_key_version : 1,
            plain_fingerprint:
              typeof rec.plain_fingerprint === 'string' ? rec.plain_fingerprint : '',
          };
        }
        return out;
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
    const cfg = this.app.vault.configDir;
    return this.app.vault
      .getMarkdownFiles()
      .map((f) => normalizeVaultPath(f.path))
      .filter((p) => shouldSync(p, cfg));
  }

  /** GET /files → { items } → path→meta */
  async fetchRemoteFiles(): Promise<SyncMetaMap> {
    const res = await syncHttpRequest({
      url: this.baseUrl + '/files',
      headers: this.syncApiHeaders(),
      timeoutMs: HTTP_TIMEOUT_MS,
    });
    if (res.status >= 400) throw httpErrorFromResponse(res);
    const s = res.text.trim();
    if (s === '') {
      throw new Error('/files 空响应');
    }
    let data: unknown;
    try {
      data = JSON.parse(s) as unknown;
    } catch (e) {
      console.error('[HailySync] JSON parse failed for /files', e);
      throw new Error('/files 响应不是合法 JSON');
    }

    const remoteFiles = parseRemoteFilesItems(data, this.app.vault.configDir);

    return remoteFiles;
  }

  async uploadFile(filePath: string, meta: SyncMetaMap): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    try {
      if (!this.deviceId) {
        throw new Error('缺少设备 ID（需要 X-Device-Id）');
      }
      await this.ensureVaultKeyLoaded();
      const content = await this.app.vault.adapter.read(normalized);
      const plain = new TextEncoder().encode(content ?? '');
      const plainFp = md5(content || '');
      const wire = await encryptPlainToWire(
        plain,
        normalized,
        this.vaultKey!,
        this.vaultKeyVersion,
      );
      const cipher_hash = await sha256HexOfBytes(wire);
      const cipher_size = wire.length;

      const updated_at = Date.now();
      const basename = normalized.includes('/')
        ? normalized.slice(normalized.lastIndexOf('/') + 1)
        : normalized;
      const mp = buildMultipartFormData(
        {
          relative_path: normalized,
          updated_at: String(updated_at),
          cipher_hash,
          cipher_size: String(cipher_size),
          encryption_version: String(ENCRYPTION_VERSION_WIRE),
          vault_key_version: String(this.vaultKeyVersion),
        },
        {
          fieldName: 'file',
          filename: basename || 'file',
          contentType: 'application/octet-stream',
          data: wire,
        },
      );

      const uploadResRaw = await syncHttpRequest({
        url: this.baseUrl + '/upload',
        method: 'POST',
        headers: this.syncApiHeaders(),
        body: mp.body,
        contentType: mp.contentType,
        timeoutMs: HTTP_TRANSFER_TIMEOUT_MS,
      });
      if (uploadResRaw.status >= 400) throw httpErrorFromResponse(uploadResRaw);
      let d: unknown;
      try {
        d = JSON.parse(uploadResRaw.text) as unknown;
      } catch {
        throw new Error('上传响应不是合法 JSON');
      }
      if (!isPlainObjectRecord(d)) {
        throw new Error('上传响应字段不完整或 success 非 true');
      }
      if (
        d.success !== true ||
        typeof d.cipher_hash !== 'string' ||
        typeof d.cipher_size !== 'number' ||
        typeof d.updated_at !== 'number' ||
        typeof d.encryption_version !== 'number' ||
        typeof d.vault_key_version !== 'number'
      ) {
        throw new Error('上传响应字段不完整或 success 非 true');
      }

      meta[normalized] = {
        cipher_hash: d.cipher_hash.toLowerCase(),
        cipher_size: d.cipher_size,
        updated_at: d.updated_at,
        deleted: false,
        encryption_version: d.encryption_version,
        vault_key_version: d.vault_key_version,
        plain_fingerprint: plainFp,
      };
    } catch (err) {
      console.error('[HailySync] upload failed:', normalized, err);
      throw err;
    }
  }

  async downloadFile(filePath: string, meta: SyncMetaMap, remote: SyncFileMeta): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    try {
      if (!this.deviceId) {
        throw new Error('缺少设备 ID（需要 X-Device-Id）');
      }
      await this.ensureVaultKeyLoaded();
      if (remote.encryption_version !== ENCRYPTION_VERSION_WIRE) {
        throw new Error(`不支持的 encryption_version:${remote.encryption_version}`);
      }
      const res = await syncHttpRequest({
        url: appendQueryUrl(this.baseUrl + '/download', { relative_path: normalized }),
        headers: this.syncApiHeaders(),
        timeoutMs: HTTP_TRANSFER_TIMEOUT_MS,
      });
      if (res.status >= 400) throw httpErrorFromResponse(res);

      const buf = httpResponseBodyToArrayBuffer(res.arrayBuffer);
      assertDownloadWireResponse(buf, headerGet(res.headers, 'content-type'));

      const plainBuf = await decryptWireToPlain(
        new Uint8Array(buf),
        normalized,
        this.vaultKey!,
      );
      const content = new TextDecoder('utf-8', { fatal: false }).decode(plainBuf);
      const plainFp = md5(content);

      const exists = this.app.vault.getAbstractFileByPath(normalized);

      if (exists) {
        await this.app.vault.adapter.write(normalized, content);
      } else {
        await ensureVaultFoldersForPath(this.app.vault, normalized);
        await this.app.vault.create(normalized, content);
      }

      meta[normalized] = {
        cipher_hash:
          typeof remote.cipher_hash === 'string' ? remote.cipher_hash.toLowerCase() : null,
        cipher_size: remote.cipher_size,
        updated_at: remote.updated_at,
        deleted: false,
        encryption_version: remote.encryption_version,
        vault_key_version: remote.vault_key_version,
        plain_fingerprint: plainFp,
      };
    } catch (err) {
      if (isHttpRequestError(err) && err.status === 404) {
        throw new Error(`下载失败：远端无此文件 (HTTP 404) · ${normalized}`);
      }
      console.error('[HailySync] download failed:', normalized, err);
      throw err;
    }
  }

  /** 将远端密文解密后写入 `原名.conflict.md` */
  async writeConflictFromRemote(filePath: string, remote: SyncFileMeta): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    await this.ensureVaultKeyLoaded();
    if (remote.encryption_version !== ENCRYPTION_VERSION_WIRE) {
      throw new Error(`不支持的 encryption_version:${remote.encryption_version}`);
    }
    try {
      const res = await syncHttpRequest({
        url: appendQueryUrl(this.baseUrl + '/download', { relative_path: normalized }),
        headers: this.syncApiHeaders(),
        timeoutMs: HTTP_TRANSFER_TIMEOUT_MS,
      });
      if (res.status >= 400) throw httpErrorFromResponse(res);
      const buf = httpResponseBodyToArrayBuffer(res.arrayBuffer);
      assertDownloadWireResponse(buf, headerGet(res.headers, 'content-type'));
      const plainBuf = await decryptWireToPlain(
        new Uint8Array(buf),
        normalized,
        this.vaultKey!,
      );
      const content = new TextDecoder('utf-8', { fatal: false }).decode(plainBuf);
      const withoutMd = normalized.replace(/\.md$/i, '');
      const conflictPath = `${withoutMd}.conflict.md`;
      await ensureVaultFoldersForPath(this.app.vault, conflictPath);
      const exists = this.app.vault.getAbstractFileByPath(conflictPath);
      if (exists) {
        await this.app.vault.adapter.write(conflictPath, content);
      } else {
        await this.app.vault.create(conflictPath, content);
      }
    } catch (err) {
      if (isHttpRequestError(err) && err.status === 404) {
        throw new Error(`冲突副本下载失败：远端无此文件 (HTTP 404) · ${normalized}`);
      }
      throw err;
    }
  }

  async postDeleteRemote(filePath: string): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    const updated_at = Date.now();
    const res = await syncHttpRequest({
      url: this.baseUrl + '/delete',
      method: 'POST',
      headers: this.syncApiHeaders(),
      contentType: 'application/json',
      body: JSON.stringify({
        relative_path: normalized,
        updated_at,
      }),
      timeoutMs: HTTP_TIMEOUT_MS,
    });
    if (res.status >= 400) throw httpErrorFromResponse(res);
    let d: unknown;
    try {
      d = JSON.parse(res.text) as unknown;
    } catch {
      throw new Error('删除响应不符合冻结协议（success / relative_path / updated_at）');
    }
    if (!isPlainObjectRecord(d)) {
      throw new Error('删除响应不符合冻结协议（success / relative_path / updated_at）');
    }
    const ok = d.success;
    const rp = d.relative_path;
    const ua = d.updated_at;
    if (
      ok !== true ||
      rp !== normalized ||
      typeof ua !== 'number'
    ) {
      throw new Error('删除响应不符合冻结协议（success / relative_path / updated_at）');
    }
  }

  async deleteLocalFile(path: string): Promise<void> {
    const normalized = normalizeVaultPath(path);
    const f = this.app.vault.getAbstractFileByPath(normalized);
    if (f instanceof TFile) {
      await this.app.fileManager.trashFile(f);
    }
  }

  async syncNow(options?: { auto?: boolean }) {
    const isAuto = options?.auto === true;
    if (isAuto && Date.now() < this.syncCooldownUntil) {
      return;
    }
    try {
      await this.ensureDeviceIdentity();
    } catch (e) {
      console.error('[HailySync] ensureDeviceIdentity in syncNow', e);
      return;
    }

    if (this.syncRunning) {
      new Notice('请稍候，上一同步尚未结束');
      return;
    }
    this.syncRunning = true;

    try {
      if (!this.settings.enableSync) {
        this.lastSyncError = '同步已关闭，请先在设置中开启自动同步';
        this.setSyncStatusFailed();
        new Notice('同步失败，请检查网络后重试');
        return;
      }

      const server = this.baseUrl;
      if (!server) {
        this.lastSyncError = '无效的服务器地址';
        this.setSyncStatusFailed();
        new Notice('连接失败，请检查网络');
        return;
      }

      if (!this.deviceId || this.connectionState !== 'connected') {
        this.lastSyncError = this.wasRevoked
          ? '当前设备已被移除，无法继续同步'
          : '请先完成设备绑定后再同步';
        this.setSyncStatusFailed();
        if (this.wasRevoked) {
          new Notice('请重新输入设备绑定码以恢复连接', 12000);
        } else {
          new Notice('设备绑定失败，请确认绑定码正确', 8000);
        }
        return;
      }

      try {
        await this.ensureVaultCryptoForSync();
      } catch (e) {
        if (isDeviceRevokedError(e)) {
          await this.handleDeviceRevoked();
          this.lastSyncError = '当前设备已被移除，无法继续同步';
          this.setSyncStatusFailed();
          new Notice('请重新输入设备绑定码以恢复连接', 12000);
          return;
        }
        this.lastSyncError = formatSyncError(e);
        this.setSyncStatusFailed();
        if (e instanceof Error && e.message === 'E2EE_NEED_BINDING_CODE') {
          new Notice('设备绑定失败，请确认绑定码正确', 15000);
        } else if (e instanceof Error && e.message === 'E2EE_NEED_FIRST_SETUP') {
          new Notice('设备绑定失败，请确认绑定码正确', 15000);
        } else {
          new Notice('同步失败，请检查网络后重试', 12000);
        }
        return;
      }

      this.setSyncStatusSyncing();
      new Notice('正在同步…');

      const meta = await this.loadMeta();
      const vaultCfg = this.app.vault.configDir;
      for (const k of Object.keys(meta)) {
        if (!shouldSync(k, vaultCfg)) delete meta[k];
      }

      let remote: SyncMetaMap;
      try {
        remote = await this.fetchRemoteFiles();
      } catch (err) {
        if (isDeviceRevokedError(err)) {
          await this.handleDeviceRevoked();
          this.lastSyncError = '当前设备已被移除，无法继续同步';
          this.setSyncStatusFailed();
          new Notice('请重新输入设备绑定码以恢复连接', 12000);
          return;
        }
        this.setSyncStatusFailed();
        if (isNetworkError(err)) {
          this.lastSyncError = '网络异常，请稍后重试';
          new Notice('连接失败，请检查网络', 8000);
        } else {
          const detail = formatSyncError(err);
          this.lastSyncError = `无法获取笔记列表：${detail}`;
          new Notice('同步失败，请检查网络后重试', 8000);
        }
        return;
      }

      const localPaths = this.listLocalFiles();
      const pathSet = new Set<string>();
      for (const p of localPaths) {
        if (shouldSync(p, vaultCfg)) pathSet.add(normalizeVaultPath(p));
      }
      for (const k of Object.keys(meta)) {
        if (shouldSync(k, vaultCfg)) pathSet.add(normalizeVaultPath(k));
      }
      for (const k of Object.keys(remote)) {
        if (shouldSync(k, vaultCfg)) pathSet.add(normalizeVaultPath(k));
      }

      const sortedPaths = [...pathSet].sort();
      const stepErrors: string[] = [];

      for (const path of sortedPaths) {
        const abstract = this.app.vault.getAbstractFileByPath(path);
        const localExists = abstract instanceof TFile;
        let localPlainFp: string | null = null;
        if (localExists) {
          try {
            const content = await this.app.vault.adapter.read(path);
            localPlainFp = md5(content || '');
          } catch {
            localPlainFp = null;
          }
        }

        const r = remote[path];
        const remoteDeleted = r?.deleted === true;

        try {
          if (remoteDeleted) {
            if (localExists) {
              // 无 baseline：本地新建或从未记入 meta，远端仅剩删除墓碑 → 应上传，勿误删本地
              if (!meta[path]) {
                await this.uploadFile(path, meta);
                continue;
              }
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
            await this.postDeleteRemote(path);
            delete meta[path];
            continue;
          }

          if (localExists) {
            if (localPlainFp === null) {
              continue;
            }

            if (!r) {
              await this.uploadFile(path, meta);
              continue;
            }

            const remoteCipherStr =
              typeof r.cipher_hash === 'string' ? r.cipher_hash.toLowerCase() : '';
            if (
              remoteCipherStr === '' ||
              r.encryption_version !== ENCRYPTION_VERSION_WIRE
            ) {
              continue;
            }

            const baseCipherRaw = meta[path]?.cipher_hash;
            const baseCipherStr =
              typeof baseCipherRaw === 'string' ? baseCipherRaw.toLowerCase() : '';
            const basePlain = meta[path]?.plain_fingerprint ?? '';
            const hasBase = baseCipherStr.length > 0;

            if (
              hasBase &&
              baseCipherStr === remoteCipherStr &&
              basePlain === localPlainFp
            ) {
              meta[path] = {
                cipher_hash: remoteCipherStr,
                cipher_size: r.cipher_size,
                updated_at: r.updated_at,
                deleted: false,
                encryption_version: r.encryption_version,
                vault_key_version: r.vault_key_version,
                plain_fingerprint: localPlainFp,
              };
              continue;
            }

            if (hasBase && basePlain !== localPlainFp && baseCipherStr !== remoteCipherStr) {
              await this.writeConflictFromRemote(path, r);
              continue;
            }
            if (hasBase && basePlain === localPlainFp && baseCipherStr !== remoteCipherStr) {
              await this.downloadFile(path, meta, r);
              continue;
            }
            if (hasBase && baseCipherStr === remoteCipherStr && basePlain !== localPlainFp) {
              await this.uploadFile(path, meta);
              continue;
            }

            await this.uploadFile(path, meta);
            continue;
          }

          if (r) {
            await this.downloadFile(path, meta, r);
            continue;
          }
        } catch (e) {
          if (isDeviceRevokedError(e)) {
            await this.handleDeviceRevoked();
            this.lastSyncError = '当前设备已被移除，无法继续同步';
            this.setSyncStatusFailed();
            new Notice('请重新输入设备绑定码以恢复连接', 12000);
            return;
          }
          console.error('[HailySync] sync step failed:', path, e);
          stepErrors.push(`${path}: ${formatSyncError(e)}`);
        }
      }

      await this.saveMeta(meta);
      if (stepErrors.length > 0) {
        const preview =
          stepErrors.length <= 2
            ? stepErrors.join('；')
            : `${stepErrors.slice(0, 2).join('；')} 等共 ${stepErrors.length} 处`;
        this.lastSyncError =
          preview.length > 500 ? `${preview.slice(0, 500)}…` : preview;
        this.setSyncStatusFailed();
        new Notice('同步失败，请检查网络后重试', 10000);
        return;
      }
      this.lastSyncAt = Date.now();
      this.lastSyncError = null;
      this.setSyncStatusSuccess();
      new Notice('同步完成');
    } catch (e) {
      this.setSyncStatusFailed();
      if (isNetworkError(e)) {
        this.lastSyncError = '网络异常，请稍后重试';
        new Notice('连接失败，请检查网络', 8000);
      } else {
        const msg = formatSyncError(e);
        this.lastSyncError = msg;
        new Notice('同步失败，请检查网络后重试', 8000);
      }
    } finally {
      this.syncRunning = false;
      this.syncCooldownUntil = Date.now() + SYNC_COOLDOWN_MS;
    }
  }
}
