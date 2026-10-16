// 状態はすべて URL の # 以降に入れる(# 以降はサーバに送られない)。JSON → deflate-raw → base64url。
export const KINDS = { a: 'announce', o: 'organizer', r: 'result' };

function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeState(kind, data) {
  if (!KINDS[kind]) throw new Error(`不明な種類: ${kind}`);
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, ...data }));
  return `${kind}=${toB64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

/** "#r=..." / "r=..." / URL 全体のどれでも受け取る。読めなければ null */
export async function decodeState(input) {
  const text = String(input ?? '').trim();
  const hash = text.includes('#') ? text.slice(text.indexOf('#') + 1) : text;
  const m = /^([aor])=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m) return null;
  try {
    const bytes = await pipe(fromB64url(m[2]), new DecompressionStream('deflate-raw'));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data?.v !== 1) return null;
    return { kind: m[1], data };
  } catch {
    return null;
  }
}
