import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ButtonInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  readLatest: vi.fn(),
  links: { get: vi.fn() },
  inviteToInstance: vi.fn(),
}));

vi.mock('../vrc-launcher', () => ({
  readLatest: mocks.readLatest,
  instanceNameOf: (location: string) => location.split(':')[1]?.split('~')[0] ?? '',
}));
vi.mock('../vrc-links', () => ({ vrcLinkStore: mocks.links }));
vi.mock('../../vrchat/createInstance', () => ({
  inviteToInstance: mocks.inviteToInstance,
  AuthError: class AuthError extends Error {},
}));
vi.mock('../commands/utils', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ エラーが発生しました: ${e instanceof Error ? e.message : String(e)}`,
}));
import { handleInviteMeButton, inviteMeButton } from '../vrc-invite';

const LOCATION = 'wrld_585f45ea-c6a6-4ba5-ad6a-188dd822f574:45350~group(grp_5a802e77-a436-491a-9edb-39fca4ff7805)~groupAccessType(plus)~region(jp)';

function interaction() {
  return {
    user: { id: 'discord-actor' },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ButtonInteraction & Record<'reply' | 'deferReply' | 'editReply', ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readLatest.mockReturnValue({ location: LOCATION, world_id: 'wrld_1', instance_id: '45350~group(grp_1)' });
  mocks.links.get.mockReturnValue({ vrcUserId: 'usr_operator', displayName: 'ゆに' });
  mocks.inviteToInstance.mockResolvedValue({ userId: 'usr_operator', label: 'あなた', status: 'sent' });
});

describe('「📨 自分に招待」ボタン', () => {
  it('最新のインスタンスに結びつく', () => {
    expect((inviteMeButton(LOCATION).toJSON() as { custom_id: string }).custom_id).toBe('vrc:invite-me:45350');
  });

  it('押した人の登録済みアカウントに、最新のインスタンスへの招待を送る', async () => {
    const i = interaction();

    await handleInviteMeButton(i, ['45350']);

    expect(mocks.links.get).toHaveBeenCalledWith('discord-actor');
    expect(mocks.inviteToInstance).toHaveBeenCalledWith('wrld_1', '45350~group(grp_1)', { userId: 'usr_operator', label: 'あなた' });
    // 本人にしか関係ないので、結果は本人にだけ見せる
    expect(i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(i.editReply).toHaveBeenCalledWith('📨 招待を送りました: あなた');
  });

  it('VRChat アカウントが未登録なら、登録のしかたを案内する', async () => {
    mocks.links.get.mockReturnValue(undefined);
    const i = interaction();

    await handleInviteMeButton(i, ['45350']);

    expect(mocks.inviteToInstance).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('/vrc-link set'), ephemeral: true }));
  });

  it('後から別のインスタンスが作られていれば招待しない', async () => {
    const i = interaction();

    await handleInviteMeButton(i, ['11111']);

    expect(mocks.inviteToInstance).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('VRChat に接続できなければ理由を返す', async () => {
    mocks.inviteToInstance.mockRejectedValue(new Error('gateway down'));
    const i = interaction();

    await handleInviteMeButton(i, ['45350']);

    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('gateway down'));
  });
});
