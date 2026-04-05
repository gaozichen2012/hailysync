/**
 * HailySync E2EE — 与服务器冻结协议一致（Wire / Envelope / Base64url）。
 */

import { argon2id } from 'hash-wasm';

export const WIRE_MAGIC = new Uint8Array([0x48, 0x53, 0x59, 0x4e, 0x01]);
export const ENCRYPTION_VERSION_WIRE = 1;
export const ENVELOPE_VERSION = 1;
export const ALGORITHM_LABEL = 'AES-256-GCM';

/** 与服务器 kek_derivation_version === 1 对齐（参数变更须同步服务端） */
const ARGON2_MEMORY_KIB = 65536;
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 4;
const ARGON2_HASH_LEN = 32;

export type VaultEnvelopeJson = {
  envelope_version: number;
  algorithm: string;
  kek_derivation_version: number;
  kek_salt: string;
  iv: string;
  ciphertext: string;
  tag: string;
  vault_key_version: number;
};

export function normalizeBindingCode(raw: string): string {
  return raw.normalize('NFKC').trim();
}

export function bytesToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToBytes(s: string): Uint8Array {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';
  else if (pad !== 0) throw new Error('E2EE_BASE64URL_INVALID');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256HexOfBytes(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return bufferToHex(new Uint8Array(digest));
}

function bufferToHex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function randomBytes(n: number): Uint8Array {
  const u = new Uint8Array(n);
  crypto.getRandomValues(u);
  return u;
}

export async function deriveKek(
  bindingCodeNormalized: string,
  salt: Uint8Array,
  kekDerivationVersion: number,
): Promise<Uint8Array> {
  if (!bindingCodeNormalized) {
    throw new Error('E2EE_BINDING_CODE_EMPTY');
  }
  if (kekDerivationVersion !== 1) {
    throw new Error(`E2EE_KEK_VERSION_UNSUPPORTED:${kekDerivationVersion}`);
  }
  const out = await argon2id({
    password: bindingCodeNormalized,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: ARGON2_HASH_LEN,
    outputType: 'binary',
  });
  return new Uint8Array(out);
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** 封装 vault_key（32 字节），AAD 为空 */
export async function wrapVaultKeyToEnvelope(
  vaultKey: Uint8Array,
  kek: Uint8Array,
  kekDerivationVersion: number,
  kekSalt: Uint8Array,
  vaultKeyVersion: number,
): Promise<VaultEnvelopeJson> {
  if (vaultKey.length !== 32) throw new Error('E2EE_VAULT_KEY_LEN');
  const iv = randomBytes(12);
  const key = await importAesKey(kek);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new Uint8Array(0) },
    key,
    vaultKey as BufferSource,
  );
  const full = new Uint8Array(ctBuf);
  const tag = full.slice(-16);
  const ciphertext = full.slice(0, -16);
  return {
    envelope_version: ENVELOPE_VERSION,
    algorithm: ALGORITHM_LABEL,
    kek_derivation_version: kekDerivationVersion,
    kek_salt: bytesToBase64url(kekSalt),
    iv: bytesToBase64url(iv),
    ciphertext: bytesToBase64url(ciphertext),
    tag: bytesToBase64url(tag),
    vault_key_version: vaultKeyVersion,
  };
}

export async function unwrapVaultKeyFromEnvelope(
  envelope: VaultEnvelopeJson,
  bindingCodeNormalized: string,
): Promise<Uint8Array> {
  if (!bindingCodeNormalized) {
    throw new Error('E2EE_BINDING_CODE_EMPTY');
  }
  if (envelope.envelope_version !== ENVELOPE_VERSION) {
    throw new Error(`E2EE_ENVELOPE_VERSION:${envelope.envelope_version}`);
  }
  if (envelope.algorithm !== ALGORITHM_LABEL) {
    throw new Error(`E2EE_ENVELOPE_ALGORITHM:${envelope.algorithm}`);
  }
  const salt = base64urlToBytes(envelope.kek_salt);
  const kek = await deriveKek(bindingCodeNormalized, salt, envelope.kek_derivation_version);
  const iv = base64urlToBytes(envelope.iv);
  const ciphertext = base64urlToBytes(envelope.ciphertext);
  const tag = base64urlToBytes(envelope.tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const key = await importAesKey(kek);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: new Uint8Array(0) },
      key,
      combined as BufferSource,
    );
  } catch {
    throw new Error('E2EE_ENVELOPE_DECRYPT_FAILED');
  }
  const vk = new Uint8Array(plain);
  if (vk.length !== 32) throw new Error('E2EE_VAULT_KEY_UNWRAP_LEN');
  return vk;
}

function utf8Enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export async function encryptPlainToWire(
  plain: Uint8Array,
  relativePath: string,
  vaultKey: Uint8Array,
  vaultKeyVersion: number,
): Promise<Uint8Array> {
  if (plain.length > 0xffffffff) throw new Error('E2EE_PLAIN_TOO_LARGE');
  const nonce = randomBytes(12);
  const aad = utf8Enc(relativePath);
  const key = await importAesKey(vaultKey);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad as BufferSource },
    key,
    plain as BufferSource,
  );
  const full = new Uint8Array(ctBuf);
  const tag = full.slice(-16);
  const ciphertext = full.slice(0, -16);

  const headerLen = WIRE_MAGIC.length + 2 + 4 + 12 + 4;
  const out = new Uint8Array(headerLen + ciphertext.length + 16);
  let o = 0;
  out.set(WIRE_MAGIC, o);
  o += WIRE_MAGIC.length;
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint16(o, ENCRYPTION_VERSION_WIRE, false);
  o += 2;
  dv.setUint32(o, vaultKeyVersion >>> 0, false);
  o += 4;
  out.set(nonce, o);
  o += 12;
  dv.setUint32(o, plain.length >>> 0, false);
  o += 4;
  out.set(ciphertext, o);
  o += ciphertext.length;
  out.set(tag, o);
  return out;
}

export async function decryptWireToPlain(
  wire: Uint8Array,
  relativePath: string,
  vaultKey: Uint8Array,
): Promise<Uint8Array> {
  if (wire.length < WIRE_MAGIC.length + 2 + 4 + 12 + 4 + 16) {
    throw new Error('E2EE_WIRE_TRUNCATED');
  }
  for (let i = 0; i < WIRE_MAGIC.length; i++) {
    if (wire[i] !== WIRE_MAGIC[i]) throw new Error('E2EE_WIRE_MAGIC');
  }
  let o = WIRE_MAGIC.length;
  const dv = new DataView(wire.buffer, wire.byteOffset, wire.byteLength);
  const encVer = dv.getUint16(o, false);
  o += 2;
  if (encVer !== ENCRYPTION_VERSION_WIRE) throw new Error(`E2EE_WIRE_ENC_VERSION:${encVer}`);
  void dv.getUint32(o, false);
  o += 4;
  const nonce = wire.slice(o, o + 12);
  o += 12;
  const plainSize = dv.getUint32(o, false);
  o += 4;
  const rest = wire.length - o;
  if (rest < 16) throw new Error('E2EE_WIRE_TAG_MISSING');
  const ciphertext = wire.slice(o, o + rest - 16);
  const tag = wire.slice(o + rest - 16, o + rest);
  if (ciphertext.length + tag.length + o !== wire.length) throw new Error('E2EE_WIRE_LAYOUT');

  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const aad = utf8Enc(relativePath);
  const key = await importAesKey(vaultKey);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad as BufferSource },
      key,
      combined as BufferSource,
    );
    const out = new Uint8Array(plain);
    if (out.length !== plainSize) throw new Error('E2EE_WIRE_PLAINSIZE_MISMATCH');
    return out;
  } catch {
    throw new Error('E2EE_WIRE_DECRYPT_FAILED');
  }
}

export function assertEnvelopeShape(e: unknown): asserts e is VaultEnvelopeJson {
  if (!isPlainObject(e)) throw new Error('E2EE_ENVELOPE_SHAPE');
  const need: (keyof VaultEnvelopeJson)[] = [
    'envelope_version',
    'algorithm',
    'kek_derivation_version',
    'kek_salt',
    'iv',
    'ciphertext',
    'tag',
    'vault_key_version',
  ];
  for (const k of need) {
    if (!(k in e)) throw new Error(`E2EE_ENVELOPE_MISSING:${k}`);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export { randomBytes };
