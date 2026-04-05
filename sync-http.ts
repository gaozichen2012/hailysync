import { requestUrl } from 'obsidian';
import type { RequestUrlParam } from 'obsidian';

export class HttpRequestError extends Error {
  readonly status?: number;
  readonly responseData: unknown;
  readonly code?: string;

  constructor(message: string, opts?: { status?: number; responseData?: unknown; code?: string }) {
    super(message);
    this.name = 'HttpRequestError';
    if (opts?.status !== undefined) this.status = opts.status;
    if (opts?.responseData !== undefined) this.responseData = opts.responseData;
    if (opts?.code !== undefined) this.code = opts.code;
  }
}

export function isHttpRequestError(err: unknown): err is HttpRequestError {
  return err instanceof HttpRequestError;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => {
      reject(new HttpRequestError('Request timeout', { code: 'ETIMEDOUT' }));
    }, ms);
    promise.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (err: unknown) => {
        window.clearTimeout(id);
        reject(err);
      },
    );
  });
}

export type SyncHttpResult = {
  status: number;
  headers: Record<string, string>;
  text: string;
  arrayBuffer: ArrayBuffer;
};

function lowerHeaderMap(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

export function syncHttpRequest(params: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
  contentType?: string;
  timeoutMs: number;
}): Promise<SyncHttpResult> {
  const { url, method = 'GET', headers = {}, body, contentType, timeoutMs } = params;
  const req: RequestUrlParam = {
    url,
    method,
    headers: { ...headers },
    throw: false,
  };
  if (body !== undefined) req.body = body;
  if (contentType !== undefined && contentType !== '') req.contentType = contentType;

  return (async () => {
    let raw;
    try {
      raw = await withTimeout(requestUrl(req), timeoutMs);
    } catch (e) {
      if (isHttpRequestError(e)) throw e;
      throw new HttpRequestError(e instanceof Error ? e.message : String(e), { code: 'ENETWORK' });
    }
    return {
      status: raw.status,
      headers: lowerHeaderMap(raw.headers),
      text: raw.text,
      arrayBuffer: raw.arrayBuffer,
    };
  })();
}

export function httpErrorFromResponse(res: SyncHttpResult): HttpRequestError {
  let responseData: unknown = res.text;
  const t = res.text.trim();
  if (t.startsWith('{')) {
    try {
      responseData = JSON.parse(t) as unknown;
    } catch {
      /* keep text */
    }
  }
  return new HttpRequestError(`HTTP ${res.status}`, { status: res.status, responseData });
}

export function buildMultipartFormData(
  fields: Record<string, string>,
  fileField: { fieldName: string; filename: string; contentType: string; data: Uint8Array },
): { contentType: string; body: ArrayBuffer } {
  const boundary = `----HailySyncForm${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const push = (s: string) => chunks.push(enc.encode(s));

  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  for (const [k, v] of Object.entries(fields)) {
    push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${esc(k)}"\r\n\r\n${v}\r\n`,
    );
  }
  push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${esc(fileField.fieldName)}"; filename="${esc(fileField.filename)}"\r\n` +
      `Content-Type: ${fileField.contentType}\r\n\r\n`,
  );
  chunks.push(fileField.data);
  push(`\r\n--${boundary}--\r\n`);

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength),
  };
}

export function headerGet(headers: Record<string, string>, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return undefined;
}

export function appendQueryUrl(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.href;
}
