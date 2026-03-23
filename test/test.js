/**
 * 双 vault 自动化同步测试（不启动 Obsidian）。
 *
 * 运行（仓库根目录）：
 *   node test/test.js
 *   MODE=mock node test/test.js
 *   MODE=real node test/test.js
 *   node test/test.js --real    （Windows 等未设置 MODE 时可用）
 *
 * 环境变量：
 *   MODE                 mock（默认）| real
 *   SYNC_TEST_BASE_URL   real 模式下的服务根 URL，默认 http://120.77.77.185:3000
 *   SYNC_TEST_PREFIX     real 模式下仅操作的远端/本地路径前缀目录，默认 test-automation-p0
 *   SYNC_TEST_PREPARE    real 模式下是否在开始前删除此前缀在远端的条目（1=是，默认 1）
 *   SYNC_TEST_CLEANUP    real 模式下通过后是否删除此前缀在远端的条目并清空本地 vault（1=是，默认 0）
 */

const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const { createSyncEngine, fetchRemoteMetaMap } = require('./sync.js');

const VAULT_A = path.join(__dirname, 'vault-A');
const VAULT_B = path.join(__dirname, 'vault-B');

const DEFAULT_REAL_BASE_URL = 'http://120.77.77.185:3000';

function resolveMode() {
  if (process.argv.includes('--real')) return 'real';
  if (process.argv.includes('--mock')) return 'mock';
  return (process.env.MODE || 'mock').trim().toLowerCase();
}

const MODE = resolveMode();
const isMock = MODE === 'mock';
const isReal = MODE === 'real';

const REAL_BASE_URL = (process.env.SYNC_TEST_BASE_URL || DEFAULT_REAL_BASE_URL).replace(/\/+$/, '');

const REMOTE_PREFIX_RAW = (process.env.SYNC_TEST_PREFIX || 'test-automation-p0').replace(/^\/+/, '').replace(/\/+$/, '');
const REMOTE_PREFIX_SLASH = `${REMOTE_PREFIX_RAW}/`;

const SYNC_TEST_PREPARE = process.env.SYNC_TEST_PREPARE !== '0';
const SYNC_TEST_CLEANUP = process.env.SYNC_TEST_CLEANUP === '1';

function printFinalFail() {
  console.log('\n========================================');
  console.log('FAIL');
  console.log('========================================\n');
}

function fail(msg) {
  console.error(`\n❌ FAIL: ${msg}\n`);
  printFinalFail();
  process.exit(1);
}

function ok(cond, msg) {
  if (!cond) fail(msg);
}

function logStep(title) {
  console.log(`\n▶ ${title}`);
}

function pathsForMode() {
  if (isReal) {
    const p = REMOTE_PREFIX_SLASH;
    return {
      newFile: `${p}test-p0-new.md`,
      conflict: `${p}test-p0-conflict.md`,
      conflictCopy: `${p}test-p0-conflict.conflict.md`,
      stable: `${p}test-p0-stable.md`,
    };
  }
  return {
    newFile: 'hello/p0-new.md',
    conflict: 'notes/conflict-note.md',
    conflictCopy: 'notes/conflict-note.conflict.md',
    stable: 'stable.md',
  };
}

/** 清空目录并重建（仅本地 vault） */
async function resetVaultDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function writeFileInVault(vaultDir, rel, content) {
  const full = path.join(vaultDir, ...rel.split('/'));
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function readFileInVault(vaultDir, rel) {
  return fs.readFile(path.join(vaultDir, ...rel.split('/')), 'utf8');
}

async function pathExistsInVault(vaultDir, rel) {
  try {
    await fs.access(path.join(vaultDir, ...rel.split('/')));
    return true;
  } catch {
    return false;
  }
}

async function deleteRemotePath(baseUrl, filePath) {
  const root = baseUrl.replace(/\/+$/, '');
  await axios.post(`${root}/delete`, { path: filePath.replace(/\\/g, '/') });
}

/** 仅删除 baseUrl 上路径以 prefix 开头的远端条目（不碰其它数据） */
async function remoteCleanupUnderPrefix(baseUrl, prefix) {
  let map;
  try {
    map = await fetchRemoteMetaMap(baseUrl);
  } catch (e) {
    console.warn('  [warn] 拉取 /files 失败，跳过远端前缀清理:', e?.message || e);
    return;
  }
  const keys = Object.keys(map).filter((k) => k.replace(/\\/g, '/').startsWith(prefix));
  keys.sort((a, b) => b.length - a.length);
  for (const p of keys) {
    try {
      await deleteRemotePath(baseUrl, p);
      console.log(`    [cleanup-remote] POST /delete ${p}`);
    } catch (e) {
      console.warn(`    [warn] 删除远端 ${p} 失败:`, e?.message || e);
    }
  }
}

function createMockSyncServer() {
  /** @type {Map<string, { content: string, hash: string, updated_at: number, deleted?: boolean }>} */
  const files = new Map();
  let uploadCount = 0;
  let downloadCount = 0;

  function buildFilesPayload() {
    const out = {};
    for (const [p, rec] of files.entries()) {
      if (!rec.deleted) {
        out[p] = { hash: rec.hash, updated_at: rec.updated_at, deleted: false };
      } else {
        out[p] = { hash: rec.hash, updated_at: rec.updated_at, deleted: true };
      }
    }
    return out;
  }

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname === '/files') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(buildFilesPayload()));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/upload') {
        uploadCount++;
        const body = JSON.parse(await readBody(req));
        const p = body.path.replace(/\\/g, '/');
        const content = body.content ?? '';
        const hash = body.hash;
        const updated_at = body.updated_at ?? Date.now();
        files.set(p, { content, hash, updated_at, deleted: false });
        console.log(`    [server] POST /upload ${p}`);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/download') {
        downloadCount++;
        const p = (url.searchParams.get('path') || '').replace(/\\/g, '/');
        const rec = files.get(p);
        if (!rec || rec.deleted) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        console.log(`    [server] GET /download ${p}`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(rec.content);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/delete') {
        const body = JSON.parse(await readBody(req));
        const p = body.path.replace(/\\/g, '/');
        const rec = files.get(p);
        if (rec) {
          rec.deleted = true;
        }
        console.log(`    [server] POST /delete ${p}`);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.statusCode = 404;
      res.end('not found');
    } catch (e) {
      console.error('mock server error', e);
      res.statusCode = 500;
      res.end(String(e));
    }
  });

  return {
    server,
    files,
    get uploadCount() {
      return uploadCount;
    },
    get downloadCount() {
      return downloadCount;
    },
    resetCounts() {
      uploadCount = 0;
      downloadCount = 0;
    },
    clearStore() {
      files.clear();
      uploadCount = 0;
      downloadCount = 0;
    },
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
    server.on('error', reject);
  });
}

async function main() {
  if (!isMock && !isReal) {
    console.error(`无效 MODE="${MODE}"，请使用 mock、real，或传参 --mock / --real`);
    printFinalFail();
    process.exit(1);
  }

  const paths = pathsForMode();
  let mock = null;
  let baseUrl = '';

  if (isMock) {
    mock = createMockSyncServer();
    const port = await listen(mock.server);
    baseUrl = `http://127.0.0.1:${port}`;
  } else {
    baseUrl = REAL_BASE_URL;
  }

  console.log('Obsidian Sync 插件 — 双设备自动化测试');
  console.log(`当前模式: ${MODE}`);
  console.log(`当前 baseUrl: ${baseUrl}`);
  if (isReal) {
    console.log(`远端隔离前缀: ${REMOTE_PREFIX_SLASH}（写入/删除仅针对此前缀；不会全站清空）`);
    console.log(
      '说明：与插件行为一致，sync 会处理远端 /files 中的全部路径，其它用户的笔记可能被下载到 test/vault-A、vault-B（仅本地测试目录）。',
    );
    console.log(`SYNC_TEST_PREPARE=${SYNC_TEST_PREPARE ? '1' : '0'} SYNC_TEST_CLEANUP=${SYNC_TEST_CLEANUP ? '1' : '0'}`);
  }
  console.log('');

  if (isReal && SYNC_TEST_PREPARE) {
    logStep('0️⃣ real 准备：仅删除远端前缀下的旧测试路径（不影响其它数据）');
    await remoteCleanupUnderPrefix(baseUrl, REMOTE_PREFIX_SLASH);
    console.log('  ✓ 远端前缀准备完成（若 /files 不可用则已跳过）');
  }

  const syncA = createSyncEngine({
    vaultRoot: VAULT_A,
    baseUrl,
    log: (m) => console.log(`  [A] ${m}`),
  }).sync;
  const syncB = createSyncEngine({
    vaultRoot: VAULT_B,
    baseUrl,
    log: (m) => console.log(`  [B] ${m}`),
  }).sync;

  try {
    // 1️⃣ 初始化
    logStep('1️⃣ 初始化：清空 vault-A / vault-B');
    await resetVaultDir(VAULT_A);
    await resetVaultDir(VAULT_B);
    if (isMock) {
      mock.clearStore();
    }
    ok((await pathExistsInVault(VAULT_A, 'x')) === false, 'vault-A 应为空');
    ok((await pathExistsInVault(VAULT_B, 'x')) === false, 'vault-B 应为空');
    console.log('  ✓ 本地 vault 干净' + (isMock ? '；mock 存储已清空' : '；未修改远端非前缀数据'));

    const testMd = paths.newFile;

    // 2️⃣ 新建文件
    logStep('2️⃣ 新建文件：A 创建 → sync A → sync B → B 上存在且内容一致');
    await writeFileInVault(VAULT_A, testMd, '# new\n');
    await syncA();
    await syncB();
    ok(await pathExistsInVault(VAULT_B, testMd), 'B 应出现新建文件');
    const bContent = await readFileInVault(VAULT_B, testMd);
    ok(bContent.includes('# new'), 'B 内容应与 A 一致');
    console.log('  ✓ 新建文件同步通过');

    // 3️⃣ 修改
    logStep('3️⃣ 修改：A 修改 → sync A → sync B');
    await writeFileInVault(VAULT_A, testMd, '# new\n\nedited-by-A\n');
    await syncA();
    await syncB();
    const b2 = await readFileInVault(VAULT_B, testMd);
    ok(b2.includes('edited-by-A'), 'B 应收到修改');
    console.log('  ✓ 修改同步通过');

    // 4️⃣ 删除
    logStep('4️⃣ 删除：A 删除文件 → sync A → sync B 消失');
    await fs.unlink(path.join(VAULT_A, ...testMd.split('/')));
    await syncA();
    await syncB();
    ok((await pathExistsInVault(VAULT_B, testMd)) === false, 'B 上文件应已删除');
    console.log('  ✓ 删除同步通过');

    // 5️⃣ 冲突
    logStep('5️⃣ 冲突：A、B 同时改同一文件（先不同步）→ sync → 后同步一侧出现 .conflict.md');
    const conflictMd = paths.conflict;
    const conflictCopy = paths.conflictCopy;
    await resetVaultDir(VAULT_A);
    await resetVaultDir(VAULT_B);
    if (isMock) {
      mock.clearStore();
    }
    const baseContent = 'base-line\n';
    await writeFileInVault(VAULT_A, conflictMd, baseContent);
    await writeFileInVault(VAULT_B, conflictMd, baseContent);
    await syncA();
    await syncB();
    await writeFileInVault(VAULT_A, conflictMd, 'version-from-A\n');
    await writeFileInVault(VAULT_B, conflictMd, 'version-from-B\n');
    await syncA();
    await syncB();
    const hasConflict =
      (await pathExistsInVault(VAULT_B, conflictCopy)) || (await pathExistsInVault(VAULT_A, conflictCopy));
    ok(hasConflict, '应生成 *.conflict.md（远端副本）');
    const conflictBody = (await pathExistsInVault(VAULT_B, conflictCopy))
      ? await readFileInVault(VAULT_B, conflictCopy)
      : await readFileInVault(VAULT_A, conflictCopy);
    ok(
      conflictBody.includes('version-from-A') || conflictBody.includes('version-from-B'),
      '冲突副本应含其中一方内容',
    );
    console.log('  ✓ 冲突用例通过');

    // 6️⃣ 稳定性
    logStep('6️⃣ 稳定性：清空后新建 stable 文件，多轮 sync，无异常');
    await resetVaultDir(VAULT_A);
    await resetVaultDir(VAULT_B);
    if (isMock) {
      mock.clearStore();
      mock.resetCounts();
    }
    const stableMd = paths.stable;
    await writeFileInVault(VAULT_A, stableMd, 'stable-v1\n');
    await syncA();
    await syncB();
    const rounds = 8;
    if (isMock) {
      mock.resetCounts();
      const u0 = mock.uploadCount;
      const d0 = mock.downloadCount;
      for (let i = 0; i < rounds; i++) {
        await syncA();
        await syncB();
      }
      ok(mock.uploadCount === u0, `稳定性：不应产生额外上传（${mock.uploadCount} vs ${u0}）`);
      ok(mock.downloadCount === d0, `稳定性：不应产生额外下载（${mock.downloadCount} vs ${d0}）`);
      console.log(`  ✓ ${rounds} 轮双向 sync 无冗余请求且无异常（mock 计数已验证）`);
    } else {
      console.log('  （real 模式不统计 mock 级 HTTP 次数，仅验证多轮 sync 无抛错）');
      for (let i = 0; i < rounds; i++) {
        await syncA();
        await syncB();
      }
      console.log(`  ✓ ${rounds} 轮双向 sync 无异常`);
    }
  } finally {
    if (mock) {
      mock.server.close();
    }
    if (isReal && SYNC_TEST_CLEANUP) {
      console.log('\n▶ 收尾：SYNC_TEST_CLEANUP=1，删除远端前缀并清空本地 vault');
      await remoteCleanupUnderPrefix(baseUrl, REMOTE_PREFIX_SLASH);
      await resetVaultDir(VAULT_A);
      await resetVaultDir(VAULT_B);
      console.log('  ✓ 已执行可选清理');
    }
  }

  console.log('\n========================================');
  console.log('ALL TEST PASSED');
  console.log('========================================\n');
}

main().catch((e) => {
  console.error(e);
  printFinalFail();
  process.exit(1);
});
