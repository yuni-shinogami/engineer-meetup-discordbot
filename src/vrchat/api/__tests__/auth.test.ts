import { describe, it, expect } from 'vitest';
import { validateUserAgent, AuthError } from '../auth';

describe('validateUserAgent', () => {
  it('正しい形式ならエラーを投げない', () => {
    expect(() => validateUserAgent('MyApp/1.0 me@example.org')).not.toThrow();
  });

  it.each([
    'MyApp/1.0 contact@example.com',
    'MyApp/1.0 your-contact@foo.org',
    'MyApp/1.0 your-email@foo.org',
    'MyApp/1.0 yourname@foo.org',
  ])('テンプレそのままの値 (%s) は AuthError を投げる', (userAgent) => {
    expect(() => validateUserAgent(userAgent)).toThrow(AuthError);
  });

  it('スラッシュが無い場合は AuthError を投げる', () => {
    expect(() => validateUserAgent('MyApp1.0 me@real-domain.org')).toThrow(AuthError);
  });

  it('スペースが無い場合は AuthError を投げる', () => {
    expect(() => validateUserAgent('MyApp/1.0me@real-domain.org')).toThrow(AuthError);
  });
});
