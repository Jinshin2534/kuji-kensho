// 抽選の本体。入力(種・当選人数・名簿)が同じなら、どこで計算しても同じ結果になる。
import { sha256Bytes, sha256Hex, isHex64 } from './hash.js';
import { canonicalRoster, rosterText } from './roster.js';

export const VERSION = 'kuji-kensho/v1';
export const MAX_WINNERS = 1000;

/** 封筒の中身。この1行の SHA-256 を先に公開する */
export function envelope(winners, seed) {
  return `${VERSION} winners=${winners} seed=${seed}`;
}

export async function commitmentOf(winners, seed) {
  return sha256Hex(envelope(winners, seed));
}

export async function rosterDigest(names) {
  return sha256Hex(rosterText(names));
}

/** 乱数の材料: 種と名簿のハッシュを入れた1行に、ブロック番号をつけて SHA-256 する */
export const blockInput = (seed, digest, i) => `${VERSION} draw seed=${seed} roster=${digest} block=${i}`;

/**
 * 32ビット整数を順に出す決定的な乱数列。
 * ブロック i = SHA-256(blockInput(i)) の32バイトを、先頭から4バイトずつ大きい桁から読む。
 */
export function createStream(seed, digest) {
  let block = -1;
  let bytes = null;
  let pos = 32;
  let count = 0;
  return {
    async next() {
      if (pos >= 32) {
        block++;
        bytes = await sha256Bytes(blockInput(seed, digest, block));
        pos = 0;
      }
      const v = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
      pos += 4;
      count++;
      return v;
    },
    get used() {
      return count;
    },
  };
}

/**
 * 0〜n-1 を偏りなく選ぶ(棄却サンプリング)。
 * range 通りの値を n で割った余りにすると、range が n で割り切れないとき小さい番号が少し出やすい。
 * そこで range - (range % n) 以上の値は捨てて引き直す。残った値はちょうど n の倍数個なので、余りは均等になる。
 */
export async function uniformInt(n, nextValue, range = 2 ** 32) {
  if (!Number.isInteger(n) || n < 1 || n > range) throw new RangeError(`n は 1〜${range} の整数: ${n}`);
  const limit = range - (range % n);
  const rejected = [];
  for (;;) {
    const u = await nextValue();
    if (u < limit) return { index: u % n, value: u, limit, rejected };
    rejected.push(u);
  }
}

export function validateParams({ winners, seed }) {
  const errors = [];
  if (!Number.isInteger(winners) || winners < 1 || winners > MAX_WINNERS) errors.push(`当選人数は1〜${MAX_WINNERS}の整数にしてください`);
  if (!isHex64(seed)) errors.push('種は16進数64桁(256ビット)でなければなりません');
  return errors;
}

/**
 * くじを引く。名簿は正規化して並べ替えたものを使うので、渡す順番は結果に影響しない。
 * 名簿を Fisher–Yates で先頭から winners 人ぶんだけ混ぜ、先頭から順に 1位, 2位, … とする。
 */
export async function draw({ seed, winners, roster }) {
  const errors = validateParams({ winners, seed });
  const { names, duplicates } = canonicalRoster(roster);
  if (duplicates.length) errors.push(`名簿に同じ名前があります: ${duplicates.join('、')}`);
  if (names.length === 0) errors.push('名簿が空です');
  if (errors.length) throw new Error(errors.join(' / '));

  const digest = await rosterDigest(names);
  const stream = createStream(seed, digest);
  const pool = names.slice();
  const k = Math.min(winners, pool.length);
  const trace = [];
  for (let i = 0; i < k; i++) {
    const remaining = pool.length - i;
    const r = await uniformInt(remaining, () => stream.next());
    const j = i + r.index;
    [pool[i], pool[j]] = [pool[j], pool[i]];
    trace.push({ round: i + 1, remaining, value: r.value, limit: r.limit, rejected: r.rejected, index: r.index, picked: pool[i] });
  }
  return {
    names,
    digest,
    commitment: await commitmentOf(winners, seed),
    winners: pool.slice(0, k),
    everyoneWins: k === names.length,
    trace,
    valuesUsed: stream.used,
  };
}
