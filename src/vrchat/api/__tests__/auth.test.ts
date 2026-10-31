import { describe, it, expect } from 'vitest';
import { currentUser, AuthError } from '../auth';
import type { VRChatClient } from '../client';

function makeClient(status: number, data: unknown): VRChatClient {
  return { http: { get: async () => ({ status, data }) } } as unknown as VRChatClient;
}

describe('currentUser', () => {
  it('ログイン中のアカウントの ID と表示名を返す', async () => {
    const client = makeClient(200, { id: 'usr_main', displayName: '慕狼ゆに' });
    expect(await currentUser(client)).toEqual({ userId: 'usr_main', displayName: '慕狼ゆに' });
  });

  it('ゲートウェイが VRChat にログインできないときは理由つきの AuthError', async () => {
    const client = makeClient(503, { error: 'login_failed', message: 'レート制限です' });
    await expect(currentUser(client)).rejects.toThrow(AuthError);
    await expect(currentUser(client)).rejects.toThrow(/レート制限です/);
  });

  it('ゲートウェイに断られたときはトークンと許可の設定を見るよう促す', async () => {
    const client = makeClient(403, { error: 'forbidden' });
    await expect(currentUser(client)).rejects.toThrow(/VRC_GATEWAY_TOKEN/);
  });

  it('それ以外の応答も AuthError にする', async () => {
    await expect(currentUser(makeClient(500, {}))).rejects.toThrow(AuthError);
  });
});
