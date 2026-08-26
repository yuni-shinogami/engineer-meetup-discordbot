import { describe, it, expect, vi } from 'vitest';
import { getUser } from '../user';
import type { VRChatClient } from '../client';

function makeClient(get: unknown): VRChatClient {
  return { http: { get } } as unknown as VRChatClient;
}

describe('getUser', () => {
  it('表示名つきで返す', async () => {
    const client = makeClient(async () => ({ status: 200, data: { id: 'usr_1', displayName: '慕狼ゆに' } }));

    expect(await getUser(client, 'usr_1')).toEqual({ id: 'usr_1', displayName: '慕狼ゆに' });
  });

  // 実在しない ID は「エラー」ではなく「見つからない」として扱いたい（貼り間違いの案内を出すため）
  it('404 は null を返す', async () => {
    const client = makeClient(async () => ({ status: 404, data: {} }));

    expect(await getUser(client, 'usr_missing')).toBeNull();
  });

  it('レガシーIDもそのまま問い合わせる', async () => {
    const get = vi.fn(async () => ({ status: 200, data: { id: '8JoV9XEdpo', displayName: '古参' } }));

    await getUser(makeClient(get), '8JoV9XEdpo');
    expect(get).toHaveBeenCalledWith('/users/8JoV9XEdpo');
  });

  it('その他のエラーは例外にする', async () => {
    const client = makeClient(async () => ({ status: 500, data: {} }));

    await expect(getUser(client, 'usr_1')).rejects.toThrow('ユーザー取得失敗 (500)');
  });
});
