import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '../src/lib/codec.js';

describe('URL への埋め込み', () => {
  it('行って戻って同じ中身', async () => {
    const data = { title: '忘年会のくじ 🎁', winners: 3, commit: 'ab'.repeat(32), roster: ['佐藤', '𠮷田', 'Émile'] };
    const s = await encodeState('r', data);
    expect(s).toMatch(/^r=[A-Za-z0-9_-]+$/);
    expect(await decodeState(`https://kuji-kensho.vercel.app/#${s}`)).toEqual({ kind: 'r', data: { v: 1, ...data } });
    expect(await decodeState(`#${s}`)).toEqual({ kind: 'r', data: { v: 1, ...data } });
  });
  it('1000人の名簿でも URL は短く収まる(圧縮)', async () => {
    const roster = Array.from({ length: 1000 }, (_, i) => `参加者${String(i).padStart(4, '0')}`);
    const s = await encodeState('r', { roster });
    expect(s.length).toBeLessThan(8000);
    expect((await decodeState(s)).data.roster).toHaveLength(1000);
  });
  it('壊れた URL は null(例外を投げない)', async () => {
    expect(await decodeState('')).toBeNull();
    expect(await decodeState('#r=!!!')).toBeNull();
    expect(await decodeState('#r=AAAA')).toBeNull();
    expect(await decodeState('#x=abc')).toBeNull();
  });
  it('不明な種類は作れない', async () => {
    await expect(encodeState('z', {})).rejects.toThrow();
  });
});
