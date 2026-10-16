// SHA-256 は Web Crypto だけを使う(ブラウザでも Node 20+ でも globalThis.crypto.subtle がある)
const enc = new TextEncoder();

export function toHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export async function sha256Bytes(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(text));
  return new Uint8Array(buf);
}

export async function sha256Hex(text) {
  return toHex(await sha256Bytes(text));
}

export const isHex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

/** 32バイト(256ビット)の種を作る。抽選で使う乱数はここだけ */
export function randomSeed(rng = globalThis.crypto) {
  const b = new Uint8Array(32);
  rng.getRandomValues(b);
  return toHex(b);
}
