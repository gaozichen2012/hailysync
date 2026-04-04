/**
 * Node 下加密闭环自检（Wire + Envelope + AAD + 空绑定码拒绝）。
 * 运行：npm run selftest:e2ee
 */
async function main(): Promise<void> {
  const { webcrypto } = await import('node:crypto');
  const { Buffer } = await import('node:buffer');
  globalThis.crypto = webcrypto as Crypto;
  globalThis.btoa = (s: string) => Buffer.from(s, 'latin1').toString('base64');
  globalThis.atob = (b64: string) => Buffer.from(b64, 'base64').toString('latin1');

  const c = await import('./crypto-e2ee');

  function u8eq(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  const vk = c.randomBytes(32);
  const rel = '笔记/测试 🎉.md';
  const plain = new TextEncoder().encode('中文「引号」\r\n\t');
  const wire = await c.encryptPlainToWire(plain, rel, vk, 1);
  if (wire[0] !== 0x48 || wire[1] !== 0x53 || wire[2] !== 0x59 || wire[3] !== 0x4e || wire[4] !== 0x01) {
    throw new Error('wire magic');
  }
  const back = await c.decryptWireToPlain(wire, rel, vk);
  if (!u8eq(back, plain)) throw new Error('wire roundtrip');

  let wrongAadFailed = false;
  try {
    await c.decryptWireToPlain(wire, 'other/path.md', vk);
  } catch {
    wrongAadFailed = true;
  }
  if (!wrongAadFailed) throw new Error('wrong AAD must fail');

  const binding = c.normalizeBindingCode('  abc-绑定  ');
  const salt = c.randomBytes(16);
  const kek = await c.deriveKek(binding, salt, 1);
  const env = await c.wrapVaultKeyToEnvelope(vk, kek, 1, salt, 1);
  const vk2 = await c.unwrapVaultKeyFromEnvelope(env, binding);
  if (!u8eq(vk2, vk)) throw new Error('envelope roundtrip');

  let emptyKekFailed = false;
  try {
    await c.deriveKek('', salt, 1);
  } catch {
    emptyKekFailed = true;
  }
  if (!emptyKekFailed) throw new Error('empty binding must fail');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
