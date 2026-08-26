import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction, User } from 'discord.js';

const mocks = vi.hoisted(() => ({
  store: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    markFriendRequestSent: vi.fn(),
  },
  getUser: vi.fn(),
  getFriendStatus: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptIncomingFriendRequest: vi.fn(),
}));

vi.mock('../../config', () => ({ config: { vrcStateDir: '/state' } }));
vi.mock('../../vrc-links', () => ({ vrcLinkStore: mocks.store }));
vi.mock('../../../vrchat/api/user', () => ({ getUser: mocks.getUser }));
vi.mock('../../../vrchat/api/friends', () => ({
  getFriendStatus: mocks.getFriendStatus,
  sendFriendRequest: mocks.sendFriendRequest,
  acceptIncomingFriendRequest: mocks.acceptIncomingFriendRequest,
}));
vi.mock('../../../vrchat/session', () => ({
  AuthError: class AuthError extends Error {},
  withSession: async (_dir: string, fn: (session: unknown) => Promise<unknown>) =>
    fn({ client: {}, user: { userId: 'usr_main', displayName: '慕狼ゆに' } }),
}));
vi.mock('../utils', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ エラーが発生しました: ${e instanceof Error ? e.message : String(e)}`,
}));

import { handleVrcLinkCommand } from '../vrc-link';

const ACTOR = { id: 'discord-actor' } as User;
const OTHER = { id: 'discord-other' } as User;
const USER_ID = 'usr_d559169b-fee8-4d7c-b78f-2d0924666750';

function interactionWith(
  subcommand: string,
  options: { profile?: string; user?: User } = {},
) {
  return {
    user: ACTOR,
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) => (name === 'profile' ? options.profile ?? null : null),
      getUser: (name: string) => (name === 'user' ? options.user ?? null : null),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & { editReply: ReturnType<typeof vi.fn>; deferReply: ReturnType<typeof vi.fn> };
}

function reply(interaction: { editReply: ReturnType<typeof vi.fn> }): string {
  const calls = interaction.editReply.mock.calls;
  return calls[calls.length - 1]![0] as string;
}

const friendStatus = (over: Partial<Record<'isFriend' | 'incomingRequest' | 'outgoingRequest', boolean>> = {}) => ({
  isFriend: false, incomingRequest: false, outgoingRequest: false, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: USER_ID, displayName: '信濃眞伊' });
  mocks.getFriendStatus.mockResolvedValue(friendStatus());
  mocks.sendFriendRequest.mockResolvedValue('sent');
  mocks.store.get.mockReturnValue(undefined);
  mocks.store.remove.mockReturnValue(true);
});

describe('/vrc-link set', () => {
  it('プロフィールURLから登録し、非フレンドならフレンド申請を送る', async () => {
    const interaction = interactionWith('set', { profile: `https://vrchat.com/home/user/${USER_ID}` });

    await handleVrcLinkCommand(interaction);

    expect(mocks.store.set).toHaveBeenCalledWith('discord-actor', {
      vrcUserId: USER_ID, displayName: '信濃眞伊', linkedBy: 'discord-actor',
    });
    expect(mocks.sendFriendRequest).toHaveBeenCalledWith({}, USER_ID);
    expect(mocks.store.markFriendRequestSent).toHaveBeenCalledWith('discord-actor');
    // 申請にメッセージを添えられないので、送信元は Discord の文面で伝えるしかない
    expect(reply(interaction)).toContain('慕狼ゆに');
    expect(reply(interaction)).toContain('フレンド申請を送りました');
  });

  it('応答は ephemeral で返す', async () => {
    const interaction = interactionWith('set', { profile: USER_ID });

    await handleVrcLinkCommand(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
  });

  it('すでにフレンドなら申請を送らない', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus({ isFriend: true }));
    const interaction = interactionWith('set', { profile: USER_ID });

    await handleVrcLinkCommand(interaction);

    expect(mocks.sendFriendRequest).not.toHaveBeenCalled();
    expect(reply(interaction)).toContain('すでに');
  });

  it('相手から申請が届いていれば承認する', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus({ incomingRequest: true }));
    mocks.acceptIncomingFriendRequest.mockResolvedValue(true);
    const interaction = interactionWith('set', { profile: USER_ID });

    await handleVrcLinkCommand(interaction);

    expect(reply(interaction)).toContain('承認しました');
    expect(mocks.sendFriendRequest).not.toHaveBeenCalled();
  });

  it('user を指定すると代理登録になり、linkedBy に実行者が残る', async () => {
    const interaction = interactionWith('set', { profile: USER_ID, user: OTHER });

    await handleVrcLinkCommand(interaction);

    expect(mocks.store.set).toHaveBeenCalledWith('discord-other', {
      vrcUserId: USER_ID, displayName: '信濃眞伊', linkedBy: 'discord-actor',
    });
    // 誰を登録したのか気づけるよう、VRChat の表示名と対象を必ず出す
    expect(reply(interaction)).toContain('信濃眞伊');
    expect(reply(interaction)).toContain('<@discord-other>');
  });

  // 慕狼ゆに本人（Bot がログインしているアカウント）を登録するケース
  it('メインアカウント自身なら登録するがフレンド申請は送らない', async () => {
    mocks.getUser.mockResolvedValue({ id: 'usr_main', displayName: '慕狼ゆに' });
    const interaction = interactionWith('set', { profile: 'usr_main' });

    await handleVrcLinkCommand(interaction);

    expect(mocks.store.set).toHaveBeenCalledWith('discord-actor', {
      vrcUserId: 'usr_main', displayName: '慕狼ゆに', linkedBy: 'discord-actor',
    });
    expect(mocks.getFriendStatus).not.toHaveBeenCalled();
    expect(mocks.sendFriendRequest).not.toHaveBeenCalled();
    expect(reply(interaction)).toContain('self-invite');
  });

  it('存在しないユーザーは登録しない', async () => {
    mocks.getUser.mockResolvedValue(null);
    const interaction = interactionWith('set', { profile: USER_ID });

    await handleVrcLinkCommand(interaction);

    expect(mocks.store.set).not.toHaveBeenCalled();
    expect(reply(interaction)).toContain('見つかりませんでした');
  });

  it('ワールドURLを貼られたら API を叩かずに指摘する', async () => {
    const interaction = interactionWith('set', { profile: 'https://vrchat.com/home/world/wrld_1' });

    await handleVrcLinkCommand(interaction);

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(reply(interaction)).toContain('ワールド');
  });

  it('申請済みなら送り直さない', async () => {
    mocks.getFriendStatus.mockResolvedValue(friendStatus({ outgoingRequest: true }));
    const interaction = interactionWith('set', { profile: USER_ID });

    await handleVrcLinkCommand(interaction);

    expect(mocks.sendFriendRequest).not.toHaveBeenCalled();
    expect(reply(interaction)).toContain('承認待ち');
  });

  // 登録は済んでいるのにエラーだけ返すと、やり直しが必要だと誤解される
  it('フレンド処理が落ちても登録は残し、登録できたことを伝える', async () => {
    mocks.getFriendStatus.mockRejectedValue(new Error('フレンド状態の取得失敗 (401)'));
    const interaction = interactionWith('set', { profile: USER_ID });

    await handleVrcLinkCommand(interaction);

    expect(mocks.store.set).toHaveBeenCalled();
    expect(reply(interaction)).toContain('信濃眞伊');
    expect(reply(interaction)).toContain('登録自体は完了しています');
  });
});

describe('/vrc-link show', () => {
  it('未登録なら登録方法を案内する', async () => {
    const interaction = interactionWith('show');

    await handleVrcLinkCommand(interaction);

    expect(reply(interaction)).toContain('未登録');
    expect(reply(interaction)).toContain('/vrc-link set');
  });

  it('登録内容とフレンド状態を表示する', async () => {
    mocks.store.get.mockReturnValue({
      vrcUserId: USER_ID, displayName: '信濃眞伊',
      linkedAt: '2026-08-26T12:00:00.000Z', linkedBy: 'discord-actor', friendRequestSentAt: null,
    });
    mocks.getFriendStatus.mockResolvedValue(friendStatus({ isFriend: true }));
    const interaction = interactionWith('show');

    await handleVrcLinkCommand(interaction);

    expect(reply(interaction)).toContain('信濃眞伊');
    expect(reply(interaction)).toContain(`https://vrchat.com/home/user/${USER_ID}`);
    expect(reply(interaction)).toContain('2026-08-26');
    expect(reply(interaction)).toContain('フレンド: ✅');
  });

  it('メインアカウント自身なら friendStatus を引かない', async () => {
    mocks.store.get.mockReturnValue({
      vrcUserId: 'usr_main', displayName: '慕狼ゆに',
      linkedAt: '2026-08-26T12:00:00.000Z', linkedBy: 'discord-actor', friendRequestSentAt: null,
    });
    const interaction = interactionWith('show');

    await handleVrcLinkCommand(interaction);

    expect(mocks.getFriendStatus).not.toHaveBeenCalled();
    expect(reply(interaction)).toContain('self-invite');
  });

  it('フレンド状態が取れなくても登録内容は見せる', async () => {
    mocks.store.get.mockReturnValue({
      vrcUserId: USER_ID, displayName: '信濃眞伊',
      linkedAt: '2026-08-26T12:00:00.000Z', linkedBy: 'discord-actor', friendRequestSentAt: null,
    });
    mocks.getFriendStatus.mockRejectedValue(new Error('取得失敗'));
    const interaction = interactionWith('show');

    await handleVrcLinkCommand(interaction);

    expect(reply(interaction)).toContain('信濃眞伊');
    expect(reply(interaction)).toContain('確認できませんでした');
  });
});

describe('/vrc-link clear', () => {
  it('解除してもフレンド関係には触れないことを伝える', async () => {
    mocks.store.get.mockReturnValue({
      vrcUserId: USER_ID, displayName: '信濃眞伊',
      linkedAt: '2026-08-26T12:00:00.000Z', linkedBy: 'discord-actor', friendRequestSentAt: null,
    });
    const interaction = interactionWith('clear');

    await handleVrcLinkCommand(interaction);

    expect(mocks.store.remove).toHaveBeenCalledWith('discord-actor');
    expect(reply(interaction)).toContain('フレンド関係');
  });

  it('未登録なら何も起きない', async () => {
    mocks.store.remove.mockReturnValue(false);
    const interaction = interactionWith('clear');

    await handleVrcLinkCommand(interaction);

    expect(reply(interaction)).toContain('登録されていません');
  });

  it('user を指定すれば他人の登録も解除できる', async () => {
    const interaction = interactionWith('clear', { user: OTHER });

    await handleVrcLinkCommand(interaction);

    expect(mocks.store.remove).toHaveBeenCalledWith('discord-other');
  });
});
