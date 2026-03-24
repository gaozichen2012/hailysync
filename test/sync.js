/**
 * Node 版同步引擎：与 main.ts 中 syncNow / 三方合并 / 冲突副本逻辑对齐，供自动化测试重复调用。
 * 不依赖 Obsidian，仅使用 fs + axios。
 */

const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const md5 = require('blueimp-md5');

const SYNC_META_FILENAME = '.sync_meta.json';
const SYNC_CONFIG_FILENAME = '.sync_config.json';

function normalizeVaultPath(p) {
  return p.replace(/\\/g, '/');
}

function shouldSync(filePath) {
  if (!filePath) return false;
  const p = normalizeVaultPath(filePath);
  if (p.startsWith('.')) return false;
  if (p.includes('.obsidian')) return false;
  if (p === SYNC_META_FILENAME || p.endsWith(`/${SYNC_META_FILENAME}`)) return false;
  if (p === SYNC_CONFIG_FILENAME || p.endsWith(`/${SYNC_CONFIG_FILENAME}`)) return false;
  return true;
}

/** 测试用 mock 返回扁平 map 时的轻量规范化（与插件 normalizeRemoteMap 行为一致） */
function normalizeRemoteMap(raw) {
  const out = {};
  const deny = new Set([
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
  for (const [k, v] of Object.entries(raw)) {
    if (deny.has(k)) continue;
    const normPath = normalizeVaultPath(k);
    if (!shouldSync(normPath)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      out[normPath] = { hash: String(v), updated_at: Date.now(), deleted: false };
      continue;
    }
    if (typeof v !== 'object' || Array.isArray(v)) continue;
    const hashRaw = v.hash ?? v.md5 ?? v.etag;
    const hash = typeof hashRaw === 'string' ? hashRaw : hashRaw != null ? String(hashRaw) : '';
    const updatedRaw = v.updated_at ?? v.updatedAt ?? v.mtime;
    const updated_at =
      typeof updatedRaw === 'number'
        ? updatedRaw
        : typeof updatedRaw === 'string' && updatedRaw.trim() !== ''
          ? Number(updatedRaw)
          : NaN;
    out[normPath] = {
      hash,
      updated_at: Number.isFinite(updated_at) ? updated_at : Date.now(),
      deleted: v.deleted === true,
    };
  }
  return out;
}

async function ensureDirsForFile(root, filePath) {
  const normalized = normalizeVaultPath(filePath);
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return;
  const folderPath = normalized.slice(0, lastSlash);
  const segments = folderPath.split('/').filter(Boolean);
  let acc = '';
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg;
    const full = path.join(root, ...acc.split('/'));
    try {
      await fs.mkdir(full, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

async function listMarkdownFiles(vaultRoot) {
  const out = [];
  async function walk(rel) {
    const dir = rel ? path.join(vaultRoot, ...rel.split('/')) : vaultRoot;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const norm = normalizeVaultPath(r);
      if (e.isDirectory()) {
        if (e.name.startsWith('.')) continue;
        if (e.name === '.obsidian') continue;
        await walk(r);
      } else if (e.name.toLowerCase().endsWith('.md') && shouldSync(norm)) {
        out.push(norm);
      }
    }
  }
  await walk('');
  return out;
}

async function loadOrCreateUserId(vaultRoot) {
  const fp = path.join(vaultRoot, SYNC_CONFIG_FILENAME);
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const o = JSON.parse(raw || '{}');
    if (o && typeof o.user_id === 'string' && o.user_id.trim()) return o.user_id.trim();
  } catch {
    /* empty */
  }
  const { randomUUID } = await import('crypto');
  const user_id = randomUUID();
  await fs.mkdir(vaultRoot, { recursive: true });
  await fs.writeFile(fp, JSON.stringify({ user_id }, null, 2), 'utf8');
  return user_id;
}

/**
 * @param {{ vaultRoot: string, baseUrl: string, log?: (m: string) => void, userId?: string }} opts
 */
function createSyncEngine({ vaultRoot, baseUrl, log = console.log, userId: forcedUserId }) {
  const root = path.resolve(vaultRoot);
  let cachedUserId = typeof forcedUserId === 'string' && forcedUserId.trim() ? forcedUserId.trim() : null;

  async function getUserId() {
    if (cachedUserId) return cachedUserId;
    cachedUserId = await loadOrCreateUserId(root);
    return cachedUserId;
  }

  async function loadMeta() {
    const fp = path.join(root, SYNC_META_FILENAME);
    try {
      const content = await fs.readFile(fp, 'utf8');
      const parsed = JSON.parse(content || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* empty */
    }
    return {};
  }

  async function saveMeta(meta) {
    await fs.writeFile(path.join(root, SYNC_META_FILENAME), JSON.stringify(meta, null, 2), 'utf8');
  }

  async function readVaultFile(relPath) {
    return fs.readFile(path.join(root, ...relPath.split('/')), 'utf8');
  }

  async function writeVaultFile(relPath, content) {
    const full = path.join(root, ...relPath.split('/'));
    await ensureDirsForFile(root, relPath);
    await fs.writeFile(full, content, 'utf8');
  }

  async function fileExists(relPath) {
    try {
      const st = await fs.stat(path.join(root, ...relPath.split('/')));
      return st.isFile();
    } catch {
      return false;
    }
  }

  async function deleteLocalFile(relPath) {
    const full = path.join(root, ...relPath.split('/'));
    try {
      await fs.unlink(full);
    } catch {
      /* ignore */
    }
  }

  async function fetchRemoteFiles() {
    const uid = await getUserId();
    const res = await axios.get(`${baseUrl.replace(/\/+$/, '')}/files`, {
      params: { user_id: uid },
      responseType: 'text',
    });
    let data = res.data;
    if (typeof data === 'string') {
      const s = data.trim();
      data = s === '' ? {} : JSON.parse(s);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return normalizeRemoteMap(data);
  }

  async function uploadFile(filePath, meta) {
    const normalized = normalizeVaultPath(filePath);
    const content = await readVaultFile(normalized).catch(() => '');
    const hash = md5(content || '');
    log(`  [upload] ${normalized} len=${(content || '').length} hash=${hash}`);
    const updated_at = Date.now();
    const uid = await getUserId();
    await axios.post(
      `${baseUrl.replace(/\/+$/, '')}/upload`,
      {
        path: normalized,
        content: content || '',
        hash,
        updated_at,
      },
      { params: { user_id: uid } },
    );
    meta[normalized] = { hash, updated_at, deleted: false };
  }

  async function downloadFile(filePath, meta) {
    const normalized = normalizeVaultPath(filePath);
    const uid = await getUserId();
    const res = await axios.get(`${baseUrl.replace(/\/+$/, '')}/download`, {
      params: { path: normalized, user_id: uid },
      responseType: 'text',
    });
    const content = res.data || '';
    log(`  [download] ${normalized} len=${content.length}`);
    await writeVaultFile(normalized, content);
    const hash = md5(content);
    const updated_at = Date.now();
    meta[normalized] = { hash, updated_at, deleted: false };
  }

  async function writeConflictFromRemote(filePath) {
    const normalized = normalizeVaultPath(filePath);
    const uid = await getUserId();
    const res = await axios.get(`${baseUrl.replace(/\/+$/, '')}/download`, {
      params: { path: normalized, user_id: uid },
      responseType: 'text',
    });
    const content = res.data || '';
    const withoutMd = normalized.replace(/\.md$/i, '');
    const conflictPath = `${withoutMd}.conflict.md`;
    log(`  [conflict] 写入远端副本 → ${conflictPath}`);
    await writeVaultFile(conflictPath, content);
  }

  async function postDeleteRemote(filePath) {
    const normalized = normalizeVaultPath(filePath);
    const uid = await getUserId();
    await axios.post(`${baseUrl.replace(/\/+$/, '')}/delete`, { path: normalized }, { params: { user_id: uid } });
  }

  /**
   * 对当前 vault 执行一轮完整同步（可重复调用）。
   * @throws 任一步骤失败时抛出，便于测试立即失败
   */
  async function sync() {
    log(`— sync 开始 vault=${root}`);
    const meta = await loadMeta();
    for (const k of Object.keys(meta)) {
      if (!shouldSync(k)) delete meta[k];
    }

    const remote = await fetchRemoteFiles();
    const localPaths = await listMarkdownFiles(root);
    const pathSet = new Set();
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

    for (const filePath of sortedPaths) {
      const localExists = await fileExists(filePath);
      let localHash = null;
      if (localExists) {
        try {
          const content = await readVaultFile(filePath);
          localHash = md5(content || '');
        } catch {
          localHash = null;
        }
      }

      const r = remote[filePath];
      const remoteDeleted = r?.deleted === true;

      if (remoteDeleted) {
        if (localExists) {
          if (!meta[filePath]) {
            log(`  sync decision: ${filePath} upload LOCAL_NEW_REMOTE_TOMBSTONE`);
            await uploadFile(filePath, meta);
            continue;
          }
          log(`  sync decision: ${filePath} delete_local REMOTE_DELETED`);
          await deleteLocalFile(filePath);
        }
        delete meta[filePath];
        continue;
      }

      if (!localExists && meta[filePath]) {
        if (meta[filePath].deleted) {
          delete meta[filePath];
          continue;
        }
        log(`  sync decision: ${filePath} post_delete_remote LOCAL_DELETED`);
        await postDeleteRemote(filePath);
        delete meta[filePath];
        continue;
      }

      if (localExists) {
        if (localHash === null) {
          log(`  sync decision: ${filePath} noop read_failed`);
          continue;
        }
        log(`  compare: ${filePath} localHash=${localHash} remoteHash=${r?.hash}`);

        if (!r) {
          log(`  sync decision: ${filePath} upload LOCAL_NEW`);
          await uploadFile(filePath, meta);
          continue;
        }

        const remoteHashStr = typeof r.hash === 'string' ? r.hash : String(r.hash ?? '');
        if (remoteHashStr !== localHash) {
          const baseRaw = meta[filePath]?.hash;
          const baseStr =
            typeof baseRaw === 'string' ? baseRaw : baseRaw != null ? String(baseRaw) : '';
          const hasBase = baseStr.length > 0;

          if (hasBase && baseStr !== localHash && baseStr !== remoteHashStr) {
            log(`  sync decision: ${filePath} conflict BOTH_MODIFIED`);
            await writeConflictFromRemote(filePath);
            continue;
          }
          if (hasBase && baseStr === localHash) {
            log(`  sync decision: ${filePath} download REMOTE_MODIFIED`);
            await downloadFile(filePath, meta);
            continue;
          }
          if (hasBase && baseStr === remoteHashStr) {
            log(`  sync decision: ${filePath} upload LOCAL_MODIFIED`);
            await uploadFile(filePath, meta);
            continue;
          }
          log(`  sync decision: ${filePath} upload LOCAL_MODIFIED_OR_NO_BASE`);
          await uploadFile(filePath, meta);
          continue;
        }

        log(`  sync decision: ${filePath} noop SYNCED`);
        meta[filePath] = {
          hash: localHash,
          updated_at: typeof r.updated_at === 'number' ? r.updated_at : Date.now(),
          deleted: false,
        };
        continue;
      }

      if (r) {
        log(`  sync decision: ${filePath} download REMOTE_NEW`);
        await downloadFile(filePath, meta);
        continue;
      }
    }

    await saveMeta(meta);
    log(`— sync 完成 vault=${root}`);
  }

  return { sync, loadMeta, saveMeta };
}

/** 拉取远端 path→meta（与引擎内解析一致），供测试清理等使用 */
async function fetchRemoteMetaMap(baseUrl, userId) {
  const root = baseUrl.replace(/\/+$/, '');
  const uid = typeof userId === 'string' && userId.trim() ? userId.trim() : '';
  if (!uid) throw new Error('fetchRemoteMetaMap 需要 userId');
  const res = await axios.get(`${root}/files`, { params: { user_id: uid }, responseType: 'text' });
  let data = res.data;
  if (typeof data === 'string') {
    const s = data.trim();
    data = s === '' ? {} : JSON.parse(s);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return normalizeRemoteMap(data);
}

module.exports = {
  createSyncEngine,
  SYNC_META_FILENAME,
  SYNC_CONFIG_FILENAME,
  fetchRemoteMetaMap,
  loadOrCreateUserId,
};
