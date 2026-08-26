import { describe, it, expect, vi } from 'vitest';
import {
  acceptIncomingFriendRequest,
  getFriendStatus,
  sendFriendRequest,
} from '../friends';
import type { VRChatClient } from '../client';

function makeClient(http: Partial<Record<'get' | 'post' | 'put', unknown>>): VRChatClient {
  return { http } as unknown as VRChatClient;
}

describe('getFriendStatus', () => {
  it('3 つのフラグを boolean に正規化する', async () => {
    const client = makeClient({
      get: vi.fn(async () => ({ status: 200, data: { isFriend: true, incomingRequest: false, outgoingRequest: false } })),
    });

    expect(await getFriendStatus(client, 'usr_1')).toEqual({
      isFriend: true, incomingRequest: false, outgoingRequest: false,
    });
  });

  it('欠けているフィールドは false 扱いにする', async () => {
    const client = makeClient({ get: vi.fn(async () => ({ status: 200, data: {} })) });

    expect(await getFriendStatus(client, 'usr_1')).toEqual({
      isFriend: false, incomingRequest: false, outgoingRequest: false,
    });
  });

  it('200 以外は例外にする', async () => {
    const client = makeClient({ get: vi.fn(async () => ({ status: 401, data: { error: 'nope' } })) });

    await expect(getFriendStatus(client, 'usr_1')).rejects.toThrow('フレンド状態の取得失敗 (401)');
  });
});

describe('sendFriendRequest', () => {
  it('200 なら sent', async () => {
    const post = vi.fn(async () => ({ status: 200, data: { id: 'frq_1' } }));
    expect(await sendFriendRequest(makeClient({ post }), 'usr_1')).toBe('sent');
    expect(post).toHaveBeenCalledWith('/user/usr_1/friendRequest');
  });

  // 送信済みは呼び出し側から見れば「申請済み」という同じ状態なので、失敗にしない
  it('送信済みの 400 は already-sent として成功扱いにする', async () => {
    const client = makeClient({
      post: vi.fn(async () => ({
        status: 400,
        data: { error: { message: 'This user has already been sent a friend request' } },
      })),
    });

    expect(await sendFriendRequest(client, 'usr_1')).toBe('already-sent');
  });

  it('別の理由の 400 は例外にする', async () => {
    const client = makeClient({
      post: vi.fn(async () => ({ status: 400, data: { error: { message: 'Nope' } } })),
    });

    await expect(sendFriendRequest(client, 'usr_1')).rejects.toThrow('フレンド申請の送信失敗 (400)');
  });

  it('404 は例外にする', async () => {
    const client = makeClient({ post: vi.fn(async () => ({ status: 404, data: {} })) });

    await expect(sendFriendRequest(client, 'usr_1')).rejects.toThrow('フレンド申請の送信失敗 (404)');
  });
});

describe('acceptIncomingFriendRequest', () => {
  it('送信者が一致する通知を accept する', async () => {
    const get = vi.fn(async () => ({
      status: 200,
      data: [
        { id: 'frq_other', type: 'friendRequest', senderUserId: 'usr_other' },
        { id: 'frq_1', type: 'friendRequest', senderUserId: 'usr_1' },
      ],
    }));
    const put = vi.fn(async () => ({ status: 200, data: {} }));

    expect(await acceptIncomingFriendRequest(makeClient({ get, put }), 'usr_1')).toBe(true);
    expect(put).toHaveBeenCalledWith('/auth/user/notifications/frq_1/accept');
  });

  it('該当する通知が無ければ false を返す（accept は呼ばない）', async () => {
    const put = vi.fn();
    const client = makeClient({ get: vi.fn(async () => ({ status: 200, data: [] })), put });

    expect(await acceptIncomingFriendRequest(client, 'usr_1')).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });

  it('accept が失敗したら例外にする', async () => {
    const client = makeClient({
      get: vi.fn(async () => ({ status: 200, data: [{ id: 'frq_1', type: 'friendRequest', senderUserId: 'usr_1' }] })),
      put: vi.fn(async () => ({ status: 500, data: {} })),
    });

    await expect(acceptIncomingFriendRequest(client, 'usr_1')).rejects.toThrow('フレンド申請の承認失敗 (500)');
  });
});
