import { describe, it, expect } from 'vitest';
import { verifyResult } from '../src/lib/verify.js';
import { draw, commitmentOf } from '../src/lib/lottery.js';
import { RISKS, stuffingAttempts } from '../src/lib/risks.js';

const SEED = '3f'.repeat(16) + 'a1'.repeat(16);
const roster = ['佐藤 花子', '鈴木 一郎', '高橋 健', '田中 美咲', '伊藤 翔', '渡辺 さくら', '山本 大輝'];

async function honest(winners = 2) {
  const commit = await commitmentOf(winners, SEED);
  const r = await draw({ seed: SEED, winners, roster });
  return { title: 'テスト', winners, commit, seed: SEED, roster: r.names, claimed: r.winners };
}
const status = (v) => Object.fromEntries(v.checks.map((c) => [c.id, c.status]));

describe('検証', () => {
  it('正直な結果は、告知のハッシュがあれば全部 ok', async () => {
    const rec = await honest();
    const v = await verifyResult(rec, { announcedCommit: rec.commit });
    expect(v.verdict).toBe('ok');
    expect(status(v)).toEqual({ params: 'ok', seal: 'ok', announce: 'ok', roster: 'ok', claim: 'ok' });
    expect(v.result.winners).toEqual(rec.claimed);
  });
  it('告知のハッシュがなければ「一部だけ確認」(結果URLだけでは信用しきれない)', async () => {
    const v = await verifyResult(await honest());
    expect(v.verdict).toBe('partial');
    expect(status(v).announce).toBe('unknown');
  });
  it('告知のハッシュは大文字・前後空白でも照合できる', async () => {
    const rec = await honest();
    const v = await verifyResult(rec, { announcedCommit: `  ${rec.commit.toUpperCase()} ` });
    expect(status(v).announce).toBe('ok');
  });
  it('種を差し替えると、封のチェックで落ちる', async () => {
    const rec = await honest();
    const v = await verifyResult({ ...rec, seed: 'cd'.repeat(32) }, { announcedCommit: rec.commit });
    expect(status(v).seal).toBe('fail');
    expect(v.verdict).toBe('fail');
  });
  it('種もハッシュも作り直した結果は、告知で見たハッシュとの照合で落ちる', async () => {
    const rec = await honest();
    const seed = 'cd'.repeat(32);
    const forged = { ...rec, seed, commit: await commitmentOf(2, seed) };
    const v = await verifyResult(forged, { announcedCommit: rec.commit });
    expect(status(v).seal).toBe('ok');
    expect(status(v).announce).toBe('fail');
  });
  it('当選人数をあとから変えると封のチェックで落ちる', async () => {
    const rec = await honest(2);
    const v = await verifyResult({ ...rec, winners: 3 }, { announcedCommit: rec.commit });
    expect(status(v).seal).toBe('fail');
  });
  it('発表した当選者を書き換えると、計算し直した結果と合わない', async () => {
    const rec = await honest();
    const v = await verifyResult({ ...rec, claimed: ['山本 大輝', rec.claimed[1]] }, { announcedCommit: rec.commit });
    expect(status(v).claim).toBe('fail');
  });
  it('名簿の重複は fail', async () => {
    const rec = await honest();
    const v = await verifyResult({ ...rec, roster: [...rec.roster, '佐藤　花子'] });
    expect(status(v).roster).toBe('fail');
  });
  it('弱い種(短い種)は形式チェックで落ちる', async () => {
    const v = await verifyResult({ winners: 1, seed: '1234', commit: 'x', roster: ['a'] });
    expect(status(v).params).toBe('fail');
    expect(v.result).toBeNull();
  });
  it('名簿にサクラを足すことは、この方式では検出できない(正直に fail にならない)', async () => {
    // 主催者は種を知っているので、名簿を変えては試せる。検証は全部通ってしまう。
    const commit = await commitmentOf(1, SEED);
    let found = null;
    for (let i = 0; i < 200 && !found; i++) {
      const stuffed = [...roster, ...Array.from({ length: i }, (_, j) => `サクラ${j}`)];
      const r = await draw({ seed: SEED, winners: 1, roster: stuffed });
      if (r.winners[0] === '伊藤 翔') found = { roster: r.names, claimed: r.winners };
    }
    expect(found).not.toBeNull();
    const v = await verifyResult({ winners: 1, seed: SEED, commit, ...found }, { announcedCommit: commit });
    expect(v.verdict).toBe('ok');
  });
});

describe('不正の余地の一覧', () => {
  it('防げるもの・見抜けるもの・防げないものがすべて載っている', () => {
    const levels = new Set(RISKS.map((r) => r.level));
    expect(levels).toEqual(new Set(['blocked', 'detectable', 'open']));
    expect(RISKS.find((r) => r.id === 'stuff').level).toBe('open');
    expect(RISKS.find((r) => r.id === 'reseed').level).toBe('blocked');
  });
  it('サクラで1人を当てるのに試す名簿の数の目安は N / 当選人数', () => {
    expect(stuffingAttempts(100, 1)).toBe(100);
    expect(stuffingAttempts(100, 3)).toBe(34);
    expect(stuffingAttempts(3, 10)).toBe(1);
    expect(stuffingAttempts(0, 1)).toBe(0);
  });
});
