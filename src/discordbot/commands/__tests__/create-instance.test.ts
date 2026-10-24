import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  createInstance: vi.fn(),
  store: { get: vi.fn() },
  storage: { lastInviteUrl: null as string | null },
  config: { vrcStateDir: '/state', vrcLauncherSshTarget: '', vrcLauncherSshKey: '' },
}));

vi.mock('../../config', () => ({ config: mocks.config }));
vi.mock('../../storage', () => ({ storage: mocks.storage }));
vi.mock('../../vrc-links', () => ({ vrcLinkStore: mocks.store }));
vi.mock('../../../vrchat/createInstance', () => ({
  createInstance: mocks.createInstance,
  AuthError: class AuthError extends Error {},
}));
vi.mock('../utils', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ エラーが発生しました: ${e instanceof Error ? e.message : String(e)}`,
}));

import { handleCreateInstanceCommand } from '../create-instance';

const USER_ID = 'usr_d559169b-fee8-4d7c-b78f-2d0924666750';

function interaction() {
  return {
    user: { id: 'discord-actor' },
    options: { getBoolean: () => null },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & { editReply: ReturnType<typeof vi.fn> };
}

type Reply = string | { content: string; components: { toJSON(): { components: { custom_id: string }[] } }[] };

function lastReply(i: { editReply: ReturnType<typeof vi.fn> }): Reply {
  const calls = i.editReply.mock.calls;
  return calls[calls.length - 1]![0] as Reply;
}

function reply(i: { editReply: ReturnType<typeof vi.fn> }): string {
  const last = lastReply(i);
  return typeof last === 'string' ? last : last.content;
}

function buttonIds(i: { editReply: ReturnType<typeof vi.fn> }): string[] {
  const last = lastReply(i);
  if (typeof last === 'string') return [];
  return last.components.flatMap(row => row.toJSON().components.map(c => c.custom_id));
}

const LOCATION = 'wrld_585f45ea-c6a6-4ba5-ad6a-188dd822f574:45350~group(grp_5a802e77-a436-491a-9edb-39fca4ff7805)~groupAccessType(plus)~region(jp)';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.vrcLauncherSshTarget = '';
  mocks.config.vrcLauncherSshKey = '';
  mocks.store.get.mockReturnValue(undefined);
  mocks.createInstance.mockResolvedValue({
    inviteUrl: 'https://vrchat.com/i/abcd',
    location: LOCATION,
    invites: [{ userId: 'usr_sub', label: 'サブアカウント', status: 'sent' }],
  });
});

describe('サブアカウントで入るボタン', () => {
  it('起動先の PC が設定されていればインスタンス名付きのボタンを出す', async () => {
    mocks.config.vrcLauncherSshTarget = 'user@vrchat-pc';
    mocks.config.vrcLauncherSshKey = '/path/to/key';
    const i = interaction();

    await handleCreateInstanceCommand(i);

    expect(buttonIds(i)).toEqual(['vrc:join-sub:45350']);
  });

  it('設定されていなければボタンを出さない', async () => {
    const i = interaction();

    await handleCreateInstanceCommand(i);

    expect(buttonIds(i)).toEqual([]);
  });
});

describe('handleCreateInstanceCommand', () => {
  it('登録済みなら実行者を招待先に加える', async () => {
    mocks.store.get.mockReturnValue({ vrcUserId: USER_ID, displayName: 'ゆに' });
    const i = interaction();

    await handleCreateInstanceCommand(i);

    expect(mocks.createInstance).toHaveBeenCalledWith(false, '/state', {
      extraInvites: [{ userId: USER_ID, label: 'あなた' }],
    });
  });

  // 未登録でもインスタンス作成自体は止めない。招待URLは返るので運用は続けられる
  it('未登録でもインスタンスは作成し、登録方法を案内する', async () => {
    const i = interaction();

    await handleCreateInstanceCommand(i);

    expect(mocks.createInstance).toHaveBeenCalledWith(false, '/state', { extraInvites: [] });
    expect(reply(i)).toContain('https://vrchat.com/i/abcd');
    expect(reply(i)).toContain('/vrc-link set');
    expect(mocks.storage.lastInviteUrl).toBe('https://vrchat.com/i/abcd');
  });

  it('招待できた相手をまとめて 1 行で報告する', async () => {
    mocks.store.get.mockReturnValue({ vrcUserId: USER_ID, displayName: 'ゆに' });
    mocks.createInstance.mockResolvedValue({
      inviteUrl: 'https://vrchat.com/i/abcd',
      invites: [
        { userId: 'usr_sub', label: 'サブアカウント', status: 'sent' },
        { userId: USER_ID, label: 'あなた', status: 'sent' },
      ],
    });
    const i = interaction();

    await handleCreateInstanceCommand(i);

    expect(reply(i)).toContain('📨 招待を送りました: サブアカウント / あなた');
    expect(reply(i)).not.toContain('/vrc-link set');
  });

  it('非フレンドだった相手は申請を送ったことと今回の入り方を案内する', async () => {
    mocks.store.get.mockReturnValue({ vrcUserId: USER_ID, displayName: 'ゆに' });
    mocks.createInstance.mockResolvedValue({
      inviteUrl: 'https://vrchat.com/i/abcd',
      invites: [{ userId: USER_ID, label: 'あなた', status: 'friend-request-sent' }],
    });
    const i = interaction();

    await handleCreateInstanceCommand(i);

    expect(reply(i)).toContain('フレンド申請を送りました');
    expect(reply(i)).toContain('招待URLから入室');
  });

  it('承認待ちの相手も案内する', async () => {
    mocks.store.get.mockReturnValue({ vrcUserId: USER_ID, displayName: 'ゆに' });
    mocks.createInstance.mockResolvedValue({
      inviteUrl: 'https://vrchat.com/i/abcd',
      invites: [{ userId: USER_ID, label: 'あなた', status: 'pending-approval' }],
    });
    const i = interaction();

    await handleCreateInstanceCommand(i);

    expect(reply(i)).toContain('承認待ち');
  });

  it('招待に失敗しても招待URLは返し、理由を添える', async () => {
    mocks.createInstance.mockResolvedValue({
      inviteUrl: 'https://vrchat.com/i/abcd',
      invites: [{ userId: 'usr_sub', label: 'サブアカウント', status: 'failed', error: '403 Forbidden' }],
    });
    const i = interaction();

    await handleCreateInstanceCommand(i);

    expect(reply(i)).toContain('https://vrchat.com/i/abcd');
    expect(reply(i)).toContain('403 Forbidden');
  });
});
