import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createGroupPlusInstance: vi.fn(),
  inviteSelf: vi.fn(),
  saveLatest: vi.fn(),
  inviteWithFriendCheck: vi.fn(),
  order: [] as string[],
}));

vi.mock('../api/instance', () => ({
  createGroupPlusInstance: mocks.createGroupPlusInstance,
  inviteSelf: mocks.inviteSelf,
}));
vi.mock('../internal/state', () => ({ saveLatest: mocks.saveLatest }));
vi.mock('../actions/invite', () => ({ inviteWithFriendCheck: mocks.inviteWithFriendCheck }));
vi.mock('../session', () => ({
  AuthError: class AuthError extends Error {},
  withSession: async (_dir: string, fn: (session: unknown) => Promise<unknown>) =>
    fn({ client: {}, user: { userId: 'usr_main', displayName: 'メイン' } }),
}));

import { createInstance } from '../createInstance';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;

  process.env.USER_AGENT = 'Test/1.0 test@example.org';
  process.env.WORLD_ID = 'wrld_1';
  process.env.GROUP_ID = 'grp_1';
  process.env.VRC_SUB_USER_ID = 'usr_sub';

  mocks.createGroupPlusInstance.mockResolvedValue({
    location: 'wrld_1:12345~group(grp_1)', instanceId: '12345', shortName: 'abcd',
  });
  mocks.saveLatest.mockImplementation(() => {
    mocks.order.push('saveLatest');
    return { invite_url: 'https://vrchat.com/i/abcd' };
  });
  mocks.inviteSelf.mockImplementation(async () => { mocks.order.push('inviteSelf'); });
  mocks.inviteWithFriendCheck.mockImplementation(async (_c: unknown, target: { userId: string; label: string }) => {
    mocks.order.push(`invite:${target.userId}`);
    return { ...target, status: 'sent' };
  });
});

describe('createInstance', () => {
  it('サブアカウントと追加の招待先に招待する', async () => {
    const result = await createInstance(true, '/state', {
      extraInvites: [{ userId: 'usr_operator', label: 'あなた' }],
    });

    expect(result.inviteUrl).toBe('https://vrchat.com/i/abcd');
    expect(result.invites.map(i => i.userId)).toEqual(['usr_sub', 'usr_operator']);
  });

  // 招待で落ちて state が残らないと、インスタンスは立っているのに /post-announcement が
  // 「未作成」で失敗する。保存は招待より先でなければならない
  it('招待より先に state を保存する', async () => {
    await createInstance(true, '/state', {
      extraInvites: [{ userId: 'usr_operator', label: 'あなた' }],
    });

    expect(mocks.order[0]).toBe('saveLatest');
    expect(mocks.order).toEqual(['saveLatest', 'inviteSelf', 'invite:usr_sub', 'invite:usr_operator']);
  });

  it('self-invite が失敗しても state と招待URLは返る', async () => {
    mocks.inviteSelf.mockRejectedValue(new Error('self-invite 失敗 (500)'));

    const result = await createInstance(true, '/state', {});

    expect(result.inviteUrl).toBe('https://vrchat.com/i/abcd');
    expect(mocks.saveLatest).toHaveBeenCalled();
  });

  it('招待が失敗しても結果として返し、例外にはしない', async () => {
    mocks.inviteWithFriendCheck.mockResolvedValue({
      userId: 'usr_sub', label: 'サブアカウント', status: 'failed', error: '403',
    });

    const result = await createInstance(true, '/state', {});

    expect(result.invites[0]?.status).toBe('failed');
    expect(result.inviteUrl).toBe('https://vrchat.com/i/abcd');
  });

  // 担当者がメインアカウント本人・サブ垢本人のケースが実際にある
  it('メインアカウント自身は招待先から除く', async () => {
    await createInstance(true, '/state', {
      extraInvites: [{ userId: 'usr_main', label: 'あなた' }],
    });

    expect(mocks.inviteWithFriendCheck.mock.calls.map(c => (c[1] as { userId: string }).userId))
      .toEqual(['usr_sub']);
  });

  it('サブアカウントと同じ相手には二重に送らない', async () => {
    const result = await createInstance(true, '/state', {
      extraInvites: [{ userId: 'usr_sub', label: 'あなた' }],
    });

    expect(result.invites.map(i => i.userId)).toEqual(['usr_sub']);
    expect(result.invites[0]?.label).toBe('サブアカウント');
  });

  it('追加の招待先が無ければサブアカウントだけに送る', async () => {
    const result = await createInstance(true, '/state');

    expect(result.invites.map(i => i.userId)).toEqual(['usr_sub']);
  });
});
