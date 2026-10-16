// 独立した検証スクリプト(scripts/verify.mjs)が、アプリ本体と同じ結果を出すこと
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vectors from './vectors.json';
import { kujiVerify } from '../scripts/verify.mjs';
import { draw, commitmentOf } from '../src/lib/lottery.js';
import { encodeState } from '../src/lib/codec.js';
import { sha256Hex } from '../src/lib/hash.js';

const script = fileURLToPath(new URL('../scripts/verify.mjs', import.meta.url));

describe('独立した検証スクリプト', () => {
  it('固定ベクトルと一致', async () => {
    for (const c of vectors) expect(await kujiVerify(c)).toEqual(c.expect);
  });
  it('ランダムな200通りで本体と一致', async () => {
    for (let i = 0; i < 200; i++) {
      const seed = await sha256Hex(`case-${i}`);
      const n = 1 + (i % 37);
      const roster = Array.from({ length: n }, (_, j) => `名${(j * 7919 + i) % 1000}`);
      const winners = 1 + (i % 9);
      const a = await draw({ seed, winners, roster });
      const b = await kujiVerify({ seed, winners, roster });
      expect(b).toEqual({ commit: a.commitment, digest: a.digest, winners: a.winners });
    }
  });
  it('CLI: 結果URLを渡すと当選者を出し、封が合えば終了コード0', async () => {
    const c = vectors[1];
    const rec = { title: 'CLIテスト', winners: c.winners, seed: c.seed, commit: c.expect.commit, roster: c.roster };
    const url = `https://kuji-kensho.vercel.app/#${await encodeState('r', rec)}`;
    const out = execFileSync(process.execPath, [script, url], { encoding: 'utf8' });
    expect(out).toContain('結果URLの値と一致');
    expect(out).toContain(`1. ${c.expect.winners[0]}`);
  });
  it('CLI: 封が合わなければ終了コード1', async () => {
    const rec = { winners: 1, seed: 'aa'.repeat(32), commit: await commitmentOf(2, 'aa'.repeat(32)), roster: ['a', 'b'] };
    const url = `#${await encodeState('r', rec)}`;
    let code = 0;
    try {
      execFileSync(process.execPath, [script, url], { encoding: 'utf8' });
    } catch (e) {
      code = e.status;
    }
    expect(code).toBe(1);
  });
});
