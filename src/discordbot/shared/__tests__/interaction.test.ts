import { describe, it, expect } from 'vitest';
import { formatError } from '../interaction';

describe('formatError', () => {
  it('Error インスタンスの message を使う', () => {
    expect(formatError(new Error('何かが壊れた'))).toBe('❌ エラーが発生しました: 何かが壊れた');
  });

  it('Error 以外は String() に変換する', () => {
    expect(formatError('文字列エラー')).toBe('❌ エラーが発生しました: 文字列エラー');
    expect(formatError(404)).toBe('❌ エラーが発生しました: 404');
  });

  it('maxLength を超えるメッセージは省略記号付きで切り詰める', () => {
    const longMessage = 'a'.repeat(10);
    const result = formatError(new Error(longMessage), 5);
    expect(result).toBe('❌ エラーが発生しました: aaaaa…');
  });

  it('maxLength 以下のメッセージは切り詰めない', () => {
    const message = 'a'.repeat(5);
    const result = formatError(new Error(message), 5);
    expect(result).toBe(`❌ エラーが発生しました: ${message}`);
  });
});
