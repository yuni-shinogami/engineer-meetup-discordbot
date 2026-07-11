import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env } from '../util';

const KEY = '__TEST_ENV_VAR__';

describe('env', () => {
  beforeEach(() => {
    delete process.env[KEY];
  });

  afterEach(() => {
    delete process.env[KEY];
  });

  it('環境変数が設定されていればその値を返す', () => {
    process.env[KEY] = 'value';
    expect(env(KEY)).toBe('value');
  });

  it('必須かつ未設定なら Missing environment variable エラーを投げる', () => {
    expect(() => env(KEY)).toThrow(`Missing environment variable: ${KEY}`);
  });

  it('required: false かつ未設定なら空文字を返す', () => {
    expect(env(KEY, { required: false })).toBe('');
  });

  it('required: false かつ未設定なら default を返す', () => {
    expect(env(KEY, { required: false, default: 'fallback' })).toBe('fallback');
  });

  it('設定済みの値は default より優先される', () => {
    process.env[KEY] = 'value';
    expect(env(KEY, { required: false, default: 'fallback' })).toBe('value');
  });
});
