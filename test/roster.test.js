import { describe, it, expect } from 'vitest';
import { normalizeName, canonicalRoster, compareCodePoints, rosterText } from '../src/lib/roster.js';

describe('名簿の正規化', () => {
  it('前後の空白を除き、途中の空白(全角・タブ含む)は半角1つ', () => {
    expect(normalizeName('  鈴木　　一郎\t')).toBe('鈴木 一郎');
  });
  it('NFC でそろえる(合成済みの é と e+結合文字は同じ人)', () => {
    expect(normalizeName('émile')).toBe('émile');
    expect(canonicalRoster(['émile', 'émile']).duplicates).toEqual(['émile']);
  });
  it('空行は捨て、文字コード順に並べる', () => {
    expect(canonicalRoster('b\n\na\r\nc\r').names).toEqual(['a', 'b', 'c']);
  });
  it('並べ順は UTF-16 ではなくコードポイント順(絵文字・異体字で差が出る)', () => {
    const astral = '𠮷'; // U+20BB7
    const bmp = '￥'; // U+FFE5
    expect([astral, bmp].sort()).toEqual([astral, bmp]); // JS 既定は UTF-16 単位なので逆になる
    expect([astral, bmp].sort(compareCodePoints)).toEqual([bmp, astral]);
  });
  it('重複は1回だけ報告する', () => {
    expect(canonicalRoster(['a', 'a', 'a', 'b', 'b']).duplicates).toEqual(['a', 'b']);
  });
  it('大文字小文字・全角半角は別人として扱う(勝手に寄せない)', () => {
    expect(canonicalRoster(['Zoe', 'zoe', 'ＡＢ', 'AB']).names).toHaveLength(4);
  });
  it('ハッシュにかける文字列は改行でつなぎ、最後に改行をつけない', () => {
    expect(rosterText(['a', 'b'])).toBe('a\nb');
  });
});
