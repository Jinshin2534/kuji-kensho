import { describe, it, expect } from 'vitest';
import vectors from './vectors.json';
import { draw, uniformInt, commitmentOf, envelope, createStream, blockInput } from '../src/lib/lottery.js';
import { sha256Hex } from '../src/lib/hash.js';

const SEED = '9e3779b97f4a7c15'.repeat(4);

describe('固定ベクトル(Python の別実装で作った期待値)', () => {
  for (const c of vectors) {
    it(c.name, async () => {
      const r = await draw(c);
      expect(r.commitment).toBe(c.expect.commit);
      expect(r.digest).toBe(c.expect.digest);
      expect(r.winners).toEqual(c.expect.winners);
    });
  }
});

describe('封筒とハッシュ', () => {
  it('封筒は1行で、SHA-256 はシェルの shasum と同じ値になる', async () => {
    expect(envelope(3, '00'.repeat(32))).toBe(`kuji-kensho/v1 winners=3 seed=${'00'.repeat(32)}`);
    // printf %s '<封筒>' | shasum -a 256
    expect(await commitmentOf(3, '00'.repeat(32))).toBe('674fab1eb804cc3baa92c774c1c18601b24f686943dc011c83e4ac2d55fefe02');
  });
  it('SHA-256 の既知の値(空文字と "abc")', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('種が1文字違えば封筒のハッシュはまったく別物', async () => {
    const a = await commitmentOf(1, SEED);
    const b = await commitmentOf(1, SEED.slice(0, -1) + '6');
    expect(a).not.toBe(b);
  });
});

describe('決定性', () => {
  const roster = Array.from({ length: 30 }, (_, i) => `人${i}`);
  it('同じ入力なら何度でも同じ結果', async () => {
    const a = await draw({ seed: SEED, winners: 5, roster });
    const b = await draw({ seed: SEED, winners: 5, roster });
    expect(a.winners).toEqual(b.winners);
    expect(a.trace).toEqual(b.trace);
  });
  it('名簿の順番・空白の揺れ・空行は結果に影響しない', async () => {
    const a = await draw({ seed: SEED, winners: 5, roster });
    const shuffled = roster.slice().reverse().map((n) => `  ${n}　`);
    const b = await draw({ seed: SEED, winners: 5, roster: ['', ...shuffled, ''] });
    expect(b.winners).toEqual(a.winners);
    expect(b.digest).toBe(a.digest);
  });
  it('当選人数を増やしても、上位の順位は変わらない(先頭から引くため)', async () => {
    const three = await draw({ seed: SEED, winners: 3, roster });
    const eight = await draw({ seed: SEED, winners: 8, roster });
    expect(eight.winners.slice(0, 3)).toEqual(three.winners);
  });
  it('名簿に1人足すと、乱数の材料が変わる', async () => {
    const a = await draw({ seed: SEED, winners: 1, roster });
    const b = await draw({ seed: SEED, winners: 1, roster: [...roster, 'サクラ'] });
    expect(b.digest).not.toBe(a.digest);
  });
  it('当選人数が名簿より多ければ全員当選、ただし順位はつく', async () => {
    const r = await draw({ seed: SEED, winners: 10, roster: ['a', 'b', 'c'] });
    expect(r.everyoneWins).toBe(true);
    expect(r.winners.slice().sort()).toEqual(['a', 'b', 'c']);
  });
  it('当選者に重複はなく、全員が名簿の中の人', async () => {
    const r = await draw({ seed: SEED, winners: 30, roster });
    expect(new Set(r.winners).size).toBe(30);
    expect(r.winners.every((n) => roster.includes(n))).toBe(true);
  });
});

describe('乱数列', () => {
  it('ブロックは SHA-256(… block=i) を4バイトずつ大きい桁から読む', async () => {
    const digest = 'ab'.repeat(32);
    const s = createStream(SEED, digest);
    const first = await s.next();
    const h = await sha256Hex(blockInput(SEED, digest, 0));
    expect(first).toBe(parseInt(h.slice(0, 8), 16));
    for (let i = 1; i < 8; i++) await s.next();
    const ninth = await s.next(); // 9個目は block=1 の先頭
    const h1 = await sha256Hex(blockInput(SEED, digest, 1));
    expect(ninth).toBe(parseInt(h1.slice(0, 8), 16));
    expect(s.used).toBe(9);
  });
});

describe('棄却サンプリング(剰余による偏りを除く)', () => {
  const feed = (values) => {
    let i = 0;
    return async () => values[i++];
  };
  it('8ビット(256通り)を3人に割ると、255 だけ捨てれば残りはちょうど 85 回ずつ', async () => {
    const counts = [0, 0, 0];
    let rejectedCount = 0;
    for (let v = 0; v < 256; v++) {
      const r = await uniformInt(3, feed([v, 0]), 256);
      if (r.rejected.length) rejectedCount++;
      else counts[r.index]++;
    }
    expect(rejectedCount).toBe(1);
    expect(counts).toEqual([85, 85, 85]);
  });
  it('どの n でも、受け入れる値の個数は n の倍数で、各番号が同じ回数ずつ出る', async () => {
    for (let n = 1; n <= 40; n++) {
      const counts = new Array(n).fill(0);
      for (let v = 0; v < 256; v++) {
        const r = await uniformInt(n, feed([v, 0]), 256);
        if (!r.rejected.length) counts[r.index]++;
      }
      expect(new Set(counts).size, `n=${n}`).toBe(1);
    }
  });
  it('単純な剰余だと偏ることの確認(棄却なしなら 0 が多く出る)', () => {
    const naive = [0, 0, 0];
    for (let v = 0; v < 256; v++) naive[v % 3]++;
    expect(naive).toEqual([86, 85, 85]);
  });
  it('捨てた値は記録され、引き直した値で決まる', async () => {
    const r = await uniformInt(3, feed([255, 255, 7]), 256);
    expect(r.rejected).toEqual([255, 255]);
    expect(r.index).toBe(1);
    expect(r.limit).toBe(255);
  });
  it('32ビットでの上限は 2^32 - (2^32 mod n)', async () => {
    const r = await uniformInt(7, feed([0]));
    expect(r.limit).toBe(2 ** 32 - (2 ** 32 % 7));
    const top = await uniformInt(7, feed([2 ** 32 - 1, 5]));
    expect(top.rejected).toEqual([2 ** 32 - 1]); // 2^32 mod 7 = 4 なので最上位の4値は捨てる
    expect(top.index).toBe(5);
  });
  it('範囲外の n はエラー', async () => {
    await expect(uniformInt(0, feed([0]))).rejects.toThrow();
    await expect(uniformInt(1.5, feed([0]))).rejects.toThrow();
  });
  it('実際のくじで、5人から1人を2万回引くと各人ほぼ 1/5(±1.5%)', async () => {
    const roster = ['a', 'b', 'c', 'd', 'e'];
    const counts = { a: 0, b: 0, c: 0, d: 0, e: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const seed = (await sha256Hex(`seed-${i}`));
      const r = await draw({ seed, winners: 1, roster });
      counts[r.winners[0]]++;
    }
    for (const k of roster) expect(Math.abs(counts[k] / N - 0.2)).toBeLessThan(0.015);
  }, 60000);
});

describe('入力エラー', () => {
  it('種が64桁の16進数でなければ引かない', async () => {
    await expect(draw({ seed: '1234', winners: 1, roster: ['a'] })).rejects.toThrow(/種/);
    await expect(draw({ seed: 'AB'.repeat(32), winners: 1, roster: ['a'] })).rejects.toThrow(/種/);
  });
  it('当選人数が不正なら引かない', async () => {
    await expect(draw({ seed: SEED, winners: 0, roster: ['a'] })).rejects.toThrow(/当選人数/);
  });
  it('同じ名前が2人いたら引かない(区別できないので)', async () => {
    await expect(draw({ seed: SEED, winners: 1, roster: ['田中', '田中 ', '佐藤'] })).rejects.toThrow(/同じ名前/);
  });
  it('名簿が空なら引かない', async () => {
    await expect(draw({ seed: SEED, winners: 1, roster: ['', ' '] })).rejects.toThrow(/空/);
  });
});
