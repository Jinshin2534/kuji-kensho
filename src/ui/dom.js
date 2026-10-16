// 描画の小道具。名簿の名前は URL から来るので、HTML に入れるときは必ず esc() を通す。
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** ハッシュを4文字ずつ区切って表示する */
export const groupHex = (h) => String(h).match(/.{1,4}/g)?.join(' ') ?? '';

// 16色: 隣り合う番号が似た色にならないよう色相を飛ばして並べる
const PALETTE = ['#c8322b', '#1f3a5f', '#e0a526', '#3b7d4f', '#7a3f8f', '#2f8fa3', '#d9642a', '#5a5a52', '#9b2d5a', '#86a83a', '#2b5fc8', '#b8860b', '#4d2f1f', '#e27a9b', '#1e6b62', '#a9a294'];

/** ハッシュの「指紋」: 64桁の16進を 8×8 のマス目の色にする。2つのハッシュを目で見比べやすくするため */
export function fingerprint(hex, size = 96) {
  if (!/^[0-9a-f]{64}$/.test(hex)) return '';
  const c = size / 8;
  let cells = '';
  for (let i = 0; i < 64; i++) {
    const x = (i % 8) * c;
    const y = Math.floor(i / 8) * c;
    cells += `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="${PALETTE[parseInt(hex[i], 16)]}"/>`;
  }
  return `<svg class="fp" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="ハッシュの模様">${cells}</svg>`;
}

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

export async function copy(text, label = 'コピーしました') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('コピーできませんでした。手で選んでコピーしてください');
  }
}

export function fmtDeadline(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
