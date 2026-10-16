// 名簿の正規化。並べ方や空白の揺れで結果が変わらないよう、くじに使う形を一つに決める。

/** 1人分の名前を整える: Unicode NFC、前後の空白を除き、途中の空白(全角含む)は半角1つにまとめる */
export function normalizeName(raw) {
  return String(raw).normalize('NFC').replace(/[\s　]+/gu, ' ').trim();
}

/** コードポイント順(UTF-8 のバイト順と同じ)で比べる。JS 既定の sort は UTF-16 単位なので使わない */
export function compareCodePoints(a, b) {
  const A = Array.from(a, (c) => c.codePointAt(0));
  const B = Array.from(b, (c) => c.codePointAt(0));
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) if (A[i] !== B[i]) return A[i] - B[i];
  return A.length - B.length;
}

/**
 * 名簿(改行区切りの文字列 or 配列)を正規化する。
 * 返り値の names はコードポイント順に並べ替え済み。重複は duplicates に出す(くじは引かない)。
 */
export function canonicalRoster(input) {
  const lines = Array.isArray(input) ? input : String(input ?? '').split(/\r\n|\r|\n/);
  const seen = new Map();
  const duplicates = [];
  for (const line of lines) {
    const name = normalizeName(line);
    if (!name) continue;
    if (seen.has(name)) {
      if (seen.get(name) === 1) duplicates.push(name);
      seen.set(name, seen.get(name) + 1);
    } else seen.set(name, 1);
  }
  const names = [...seen.keys()].sort(compareCodePoints);
  return { names, duplicates: duplicates.sort(compareCodePoints) };
}

/** ハッシュにかける名簿の文字列。1行1人、最後に改行なし */
export const rosterText = (names) => names.join('\n');
