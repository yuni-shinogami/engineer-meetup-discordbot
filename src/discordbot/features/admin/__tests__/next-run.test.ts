import { describe, it, expect } from 'vitest';
import { formatNextRun } from '../next-run';

describe('formatNextRun', () => {
  it('正しい cron 式なら次回実行時刻の文字列を返す', () => {
    const result = formatNextRun('0 19 * * 4');
    expect(result).not.toBe('(解析失敗)');
    expect(result.length).toBeGreaterThan(0);
  });

  it('不正な cron 式なら解析失敗の文字列を返す', () => {
    expect(formatNextRun('not a cron expression')).toBe('(解析失敗)');
  });
});
