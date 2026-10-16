// くじ検証 — 独立した検証スクリプト(依存なし・この1ファイルだけで動く)
// アプリ本体のコードは使わず、公開している手順だけから書き直したもの。
//   Node 20+:  node verify.mjs "https://kuji-kensho.vercel.app/#r=..."
//   ブラウザ:   import { kujiVerify } from "./verify.mjs"; await kujiVerify({ seed, winners, roster })
const V = 'kuji-kensho/v1';

async function sha(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

async function kujiVerify({ seed, winners, roster }) {
  // 1. 封筒: この1行の SHA-256 が、締め切り前に告知されたハッシュ
  const commit = hex(await sha(`${V} winners=${winners} seed=${seed}`));
  // 2. 名簿: NFC・空白をまとめる → 空行を除く → コードポイント順に並べる → 改行でつなぐ
  const names = [...new Set(roster.map((n) => n.normalize('NFC').replace(/[\s　]+/gu, ' ').trim()).filter(Boolean))];
  const cp = (s) => Array.from(s, (c) => c.codePointAt(0));
  names.sort((a, b) => {
    const A = cp(a), B = cp(b);
    for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return A[i] - B[i];
    return A.length - B.length;
  });
  const digest = hex(await sha(names.join('\n')));
  // 3. 乱数: SHA-256("… block=i") の32バイトを4バイトずつ、大きい桁から32ビット整数として読む
  const values = [];
  let block = 0;
  const next = async () => {
    if (!values.length) {
      const b = await sha(`${V} draw seed=${seed} roster=${digest} block=${block++}`);
      for (let i = 0; i < 32; i += 4) values.push(b[i] * 2 ** 24 + b[i + 1] * 2 ** 16 + b[i + 2] * 2 ** 8 + b[i + 3]);
    }
    return values.shift();
  };
  // 4. 先頭から Fisher–Yates。2^32 を n で割った余りぶんの大きい値は捨てて引き直す(棄却サンプリング)
  const pool = names.slice();
  const k = Math.min(winners, pool.length);
  for (let i = 0; i < k; i++) {
    const n = pool.length - i;
    const limit = 2 ** 32 - (2 ** 32 % n);
    let u;
    do u = await next(); while (u >= limit);
    const j = i + (u % n);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { commit, digest, winners: pool.slice(0, k) };
}

async function decodeUrl(url) {
  const m = /#r=([A-Za-z0-9_-]+)/.exec(url);
  if (!m) throw new Error('結果URL(#r=…)を渡してください');
  const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const out = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(out).text());
}

globalThis.kujiVerify = kujiVerify;
export { kujiVerify, decodeUrl };

const isCli = typeof process !== 'undefined' && !!process.argv?.[1] && import.meta.url.startsWith('file:') &&
  decodeURIComponent(new URL(import.meta.url).pathname) === (await import('node:fs')).realpathSync(process.argv[1]);
if (isCli) {
  const url = process.argv[2];
  if (!url) {
    console.error('使い方: node verify.mjs "<結果URL>"');
    process.exit(2);
  }
  const rec = await decodeUrl(url);
  const r = await kujiVerify(rec);
  const sealOk = r.commit === String(rec.commit).toLowerCase();
  console.log(`くじ: ${rec.title || '(題名なし)'}`);
  console.log(`封筒のハッシュ: ${r.commit} ${sealOk ? '— 結果URLの値と一致' : `— 不一致! 結果URLには ${rec.commit}`}`);
  console.log(`名簿のハッシュ: ${r.digest}`);
  console.log('当選:');
  r.winners.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
  console.log('告知で見たハッシュと、上の「封筒のハッシュ」が同じかを自分の目で確かめてください。');
  process.exit(sealOk ? 0 : 1);
}
