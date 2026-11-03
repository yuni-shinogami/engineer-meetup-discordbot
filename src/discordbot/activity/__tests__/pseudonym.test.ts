import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createPseudonymizer, loadPseudonymSecret } from '../pseudonym';

describe('createPseudonymizer', () => {
  it('同じ ID は同じ仮名になり、元の ID は含まない', () => {
    const pseudonym = createPseudonymizer('secret');
    expect(pseudonym('123456789012345678')).toBe(pseudonym('123456789012345678'));
    expect(pseudonym('123456789012345678')).toMatch(/^[0-9a-f]{16}$/);
    expect(pseudonym('123456789012345678')).not.toBe(pseudonym('123456789012345679'));
  });

  it('鍵が違えば別の仮名になる', () => {
    expect(createPseudonymizer('a')('1')).not.toBe(createPseudonymizer('b')('1'));
  });
});

describe('loadPseudonymSecret', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pseudonym-test-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('環境変数の鍵があればそれを使う', () => {
    expect(loadPseudonymSecret(dir, 'from-env')).toBe('from-env');
  });

  it('鍵が無ければ生成して保存し、次からは同じ鍵を使う', () => {
    const first = loadPseudonymSecret(dir, '');
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(join(dir, '.secret'), 'utf-8')).toBe(first);
    expect(loadPseudonymSecret(dir, '')).toBe(first);
  });
});
