import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  config: {
    canvaClientId: 'client-id',
    canvaClientSecret: 'cnvca-secret',
    canvaRedirectUri: 'http://127.0.0.1:8976/callback',
    canvaStateDir: '',
  },
}));

vi.mock('axios', () => ({ default: { post: mocks.post } }));
vi.mock('../../discordbot/config', () => ({ config: mocks.config }));

import {
  CanvaReauthRequiredError,
  getAccessToken,
  readTokenFile,
  resetAccessTokenCache,
  saveTokenFile,
  tokenFilePath,
} from '../auth';

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    data: {
      access_token: 'access-1',
      refresh_token: 'refresh-new',
      token_type: 'Bearer',
      expires_in: 14400,
      ...overrides,
    },
  };
}

describe('Canva の認証', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'canva-auth-test-'));
    mocks.config.canvaStateDir = dir;
    mocks.post.mockReset();
    resetAccessTokenCache();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('トークンファイル', () => {
    it('保存した値を読み戻せる', () => {
      saveTokenFile('refresh-abc');
      expect(readTokenFile()?.refreshToken).toBe('refresh-abc');
    });

    it('ファイルが無ければ null を返す', () => {
      expect(readTokenFile()).toBeNull();
    });

    it('中身が壊れていても例外にせず null を返す', () => {
      writeFileSync(tokenFilePath(), '{ not json');
      expect(readTokenFile()).toBeNull();
    });

    it('refreshToken が空のファイルは未保存として扱う', () => {
      writeFileSync(tokenFilePath(), JSON.stringify({ refreshToken: '' }));
      expect(readTokenFile()).toBeNull();
    });

    it('一時ファイルを残さない', () => {
      saveTokenFile('refresh-abc');
      expect(existsSync(`${tokenFilePath()}.tmp`)).toBe(false);
    });
  });

  describe('getAccessToken', () => {
    it('保存されたトークンが無ければ再認可を促す', async () => {
      await expect(getAccessToken()).rejects.toBeInstanceOf(CanvaReauthRequiredError);
      expect(mocks.post).not.toHaveBeenCalled();
    });

    it('リフレッシュして得たアクセストークンを返す', async () => {
      saveTokenFile('refresh-old');
      mocks.post.mockResolvedValue(tokenResponse());

      expect(await getAccessToken()).toBe('access-1');

      const body = mocks.post.mock.calls[0]![1] as URLSearchParams;
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-old');
    });

    it('回転した新しいリフレッシュトークンを保存する', async () => {
      saveTokenFile('refresh-old');
      mocks.post.mockResolvedValue(tokenResponse());

      await getAccessToken();

      expect(readTokenFile()?.refreshToken).toBe('refresh-new');
    });

    it('アクセストークンを返す前に新しいリフレッシュトークンを保存し終えている', async () => {
      saveTokenFile('refresh-old');
      // 保存が済んでいなければ、この時点でファイルには古い値が残っている
      let savedWhenResolved: string | undefined;
      mocks.post.mockResolvedValue(tokenResponse());

      await getAccessToken().then(() => {
        savedWhenResolved = readTokenFile()?.refreshToken;
      });

      expect(savedWhenResolved).toBe('refresh-new');
    });

    it('期限内なら再取得せずキャッシュを返す', async () => {
      saveTokenFile('refresh-old');
      mocks.post.mockResolvedValue(tokenResponse());

      await getAccessToken();
      await getAccessToken();

      expect(mocks.post).toHaveBeenCalledTimes(1);
    });

    it('期限が近ければ取り直す', async () => {
      saveTokenFile('refresh-old');
      mocks.post.mockResolvedValue(tokenResponse({ expires_in: 60 }));

      await getAccessToken();
      await getAccessToken();

      expect(mocks.post).toHaveBeenCalledTimes(2);
    });

    it('同時に呼ばれてもリフレッシュは1回だけ走る', async () => {
      // リフレッシュトークンは単発使用なので、2本走ると後の1本が必ず失敗する
      saveTokenFile('refresh-old');
      mocks.post.mockResolvedValue(tokenResponse());

      const results = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);

      expect(mocks.post).toHaveBeenCalledTimes(1);
      expect(results).toEqual(['access-1', 'access-1', 'access-1']);
    });

    it('リフレッシュが拒否されたら再認可を促す', async () => {
      saveTokenFile('refresh-old');
      mocks.post.mockResolvedValue({ status: 400, data: { error: 'invalid_grant' } });

      await expect(getAccessToken()).rejects.toBeInstanceOf(CanvaReauthRequiredError);
    });

    it('リフレッシュに失敗した後でも、次の呼び出しでやり直せる', async () => {
      saveTokenFile('refresh-old');
      mocks.post.mockResolvedValueOnce({ status: 500, data: {} });
      mocks.post.mockResolvedValueOnce(tokenResponse());

      await expect(getAccessToken()).rejects.toBeInstanceOf(CanvaReauthRequiredError);
      expect(await getAccessToken()).toBe('access-1');
    });

    it('client_id と client_secret を Basic 認証で送る', async () => {
      saveTokenFile('refresh-old');
      mocks.post.mockResolvedValue(tokenResponse());

      await getAccessToken();

      const options = mocks.post.mock.calls[0]![2] as { headers: Record<string, string> };
      const decoded = Buffer.from(options.headers.Authorization!.replace('Basic ', ''), 'base64').toString();
      expect(decoded).toBe('client-id:cnvca-secret');
      expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });
  });
});
