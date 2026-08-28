import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFriendStatus: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptIncomingFriendRequest: vi.fn(),
  inviteUser: vi.fn(),
}));

vi.mock('../../api/friends', () => ({
  getFriendStatus: mocks.getFriendStatus,
  sendFriendRequest: mocks.sendFriendRequest,
  acceptIncomingFriendRequest: mocks.acceptIncomingFriendRequest,
}));
vi.mock('../../api/instance', () => ({ inviteUser: mocks.inviteUser }));

import { inviteWithFriendCheck } from '../invite';
import type { VRChatClient } from '../../api/client';

const client = {} as VRChatClient;
const target = { userId: 'usr_1', label: 'あなた' };

const friendStatus = (over: Partial<Record<'isFriend' | 'incomingRequest' | 'outgoingRequest', boolean>> = {}) => ({
  isFriend: false, incomingRequest: false, outgoingRequest: false, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inviteUser.mockResolvedValue(undefined);
});

describe('inviteWithFriendCheck', () => {
  it('フレンドなら招待を送る', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus({ isFriend: true }));

    const outcome = await inviteWithFriendCheck(client, target, 'wrld_1', '12345');

    expect(outcome).toEqual({ ...target, status: 'sent' });
    expect(mocks.inviteUser).toHaveBeenCalledWith(client, 'usr_1', 'wrld_1', '12345');
    expect(mocks.sendFriendRequest).not.toHaveBeenCalled();
  });

  // 招待はフレンド限定なので、非フレンドには招待を試さずに申請へ倒す
  it('非フレンドなら招待せずフレンド申請を送る', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus());
    mocks.sendFriendRequest.mockResolvedValue('sent');

    const outcome = await inviteWithFriendCheck(client, target, 'wrld_1', '12345');

    expect(outcome).toEqual({ ...target, status: 'friend-request-sent' });
    expect(mocks.inviteUser).not.toHaveBeenCalled();
  });

  it('申請済みなら送り直さず承認待ちとして返す', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus({ outgoingRequest: true }));

    const outcome = await inviteWithFriendCheck(client, target, 'wrld_1', '12345');

    expect(outcome.status).toBe('pending-approval');
    expect(mocks.sendFriendRequest).not.toHaveBeenCalled();
  });

  // friendStatus と実際の状態がずれた場合の保険
  it('申請が競合して already-sent が返っても承認待ちとして扱う', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus());
    mocks.sendFriendRequest.mockResolvedValue('already-sent');

    const outcome = await inviteWithFriendCheck(client, target, 'wrld_1', '12345');

    expect(outcome.status).toBe('pending-approval');
  });

  it('相手から申請が来ていれば承認してそのまま招待する', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus({ incomingRequest: true }));
    mocks.acceptIncomingFriendRequest.mockResolvedValue(true);

    const outcome = await inviteWithFriendCheck(client, target, 'wrld_1', '12345');

    expect(outcome.status).toBe('sent');
    expect(mocks.inviteUser).toHaveBeenCalled();
    expect(mocks.sendFriendRequest).not.toHaveBeenCalled();
  });

  it('承認する通知が見つからなければ申請にフォールバックする', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus({ incomingRequest: true }));
    mocks.acceptIncomingFriendRequest.mockResolvedValue(false);
    mocks.sendFriendRequest.mockResolvedValue('sent');

    const outcome = await inviteWithFriendCheck(client, target, 'wrld_1', '12345');

    expect(outcome.status).toBe('friend-request-sent');
  });

  // Group+ なので招待が飛ばなくても入室はできる。例外を投げてインスタンス作成を巻き込まない
  it('招待が失敗しても例外にせず failed で返す', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus({ isFriend: true }));
    mocks.inviteUser.mockRejectedValue(new Error('usr_1 への招待失敗 (403)'));

    const outcome = await inviteWithFriendCheck(client, target, 'wrld_1', '12345');

    expect(outcome.status).toBe('failed');
    expect(outcome.error).toContain('403');
  });

  it('フレンド状態の取得が失敗しても failed で返す', async () => {
    mocks.getFriendStatus.mockRejectedValue(new Error('フレンド状態の取得失敗 (401)'));

    const outcome = await inviteWithFriendCheck(client, target, 'wrld_1', '12345');

    expect(outcome.status).toBe('failed');
  });
});
