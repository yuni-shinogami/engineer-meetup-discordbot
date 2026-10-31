import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../client';

describe('createClient', () => {
  beforeEach(() => {
    process.env.VRC_GATEWAY_URL = 'http://192.168.2.115:8080';
    process.env.VRC_GATEWAY_TOKEN = 'token-from-env';
  });

  it('ゲートウェイの /api/1 を VRChat API の代わりに呼ぶ', () => {
    const { http } = createClient();
    expect(http.defaults.baseURL).toBe('http://192.168.2.115:8080/api/1');
  });

  it('ゲートウェイのトークンを Bearer で送る', () => {
    const { http } = createClient();
    expect(http.defaults.headers['Authorization']).toBe('Bearer token-from-env');
  });

  it('URL の末尾のスラッシュは 1 つにまとめる', () => {
    const { http } = createClient('http://gw:8080/', 't');
    expect(http.defaults.baseURL).toBe('http://gw:8080/api/1');
  });

  // 4xx/5xx でも例外にせず、各 API 関数がステータスを見て文面を作る（直接 VRChat を呼んでいたときと同じ）
  it('どのステータスでも例外を投げない', () => {
    const { http } = createClient();
    expect(http.defaults.validateStatus?.(503)).toBe(true);
  });

  it('設定が無ければ例外にする', () => {
    delete process.env.VRC_GATEWAY_TOKEN;
    expect(() => createClient()).toThrow(/VRC_GATEWAY_TOKEN/);
  });
});
