import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';

vi.mock('../../discordbot/config', () => ({
  config: {
    canvaClientId: 'client-id',
    canvaClientSecret: 'cnvca-secret',
    canvaRedirectUri: 'http://127.0.0.1:8976/callback',
    canvaStateDir: '/tmp/unused',
  },
}));

import { buildAuthorizeUrl, createPkcePair, statesMatch } from '../login';

describe('createPkcePair', () => {
  it('challenge は verifier の SHA-256 を base64url にしたもの', () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('verifier の長さが仕様の 43〜128 文字に収まる', () => {
    const { verifier } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('verifier に使える文字だけで構成される', () => {
    const { verifier } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('毎回異なる値を返す', () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
  });
});

describe('buildAuthorizeUrl', () => {
  it('Canva が要求するパラメータを並べる', () => {
    const url = new URL(buildAuthorizeUrl('challenge-value', 'state-value'));

    expect(url.origin + url.pathname).toBe('https://www.canva.com/api/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8976/callback');
    expect(url.searchParams.get('state')).toBe('state-value');
  });

  it('PDF エクスポートに要るスコープを要求する', () => {
    const url = new URL(buildAuthorizeUrl('c', 's'));
    expect(url.searchParams.get('scope')?.split(' ')).toContain('design:content:read');
  });

  it('client_secret は認可 URL に出さない', () => {
    expect(buildAuthorizeUrl('c', 's')).not.toContain('cnvca-secret');
  });
});

describe('statesMatch', () => {
  it('一致すれば true', () => {
    expect(statesMatch('abc', 'abc')).toBe(true);
  });

  it('異なれば false', () => {
    expect(statesMatch('abc', 'xyz')).toBe(false);
  });

  it('長さが違っても例外にせず false を返す', () => {
    expect(statesMatch('abc', 'abcdef')).toBe(false);
  });

  it('state が無ければ false', () => {
    expect(statesMatch('abc', null)).toBe(false);
  });
});
