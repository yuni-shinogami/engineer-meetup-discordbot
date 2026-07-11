import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config', () => ({
  config: {
    operatorRoleId: 'operator-role',
    operationsChannelId: 'ops-id',
    publicChannelId: 'public-id',
    testChannelId: 'test-id',
    vrcStateDir: '',
  },
}));

vi.mock('../../storage', () => ({
  storage: {
    isScheduled: true,
    preAnnouncePostUrl: 'https://x.com/foo/status/1',
    lastInviteUrl: 'https://vrchat.com/i/abc',
  },
}));

import { handleStatusCommand } from '../status';
import type { ChatInputCommandInteraction } from 'discord.js';

function makeInteraction(memberRoles = ['operator-role']) {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn().mockResolvedValue({});
  const interaction = {
    member: { roles: memberRoles },
    deferReply,
    editReply,
    reply,
    client: { channels: { fetch } },
  };
  return interaction as unknown as ChatInputCommandInteraction & {
    deferReply: typeof deferReply;
    editReply: typeof editReply;
    reply: typeof reply;
  };
}

describe('handleStatusCommand', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('権限が無い場合は deferReply/editReply せず reply のみ行う', async () => {
    const interaction = makeInteraction(['other-role']);

    await handleStatusCommand(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('X APIキーが両方設定されていれば設定済みと表示する', async () => {
    vi.stubEnv('X_API_KEY', 'a');
    vi.stubEnv('TEST_X_API_KEY', 'b');
    const interaction = makeInteraction();

    await handleStatusCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('✅ X API 認証情報: 設定済み');
  });

  it('X APIキーが片方でも欠けていれば未設定と表示する', async () => {
    vi.stubEnv('X_API_KEY', '');
    vi.stubEnv('TEST_X_API_KEY', 'b');
    const interaction = makeInteraction();

    await handleStatusCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('❌ X API 認証情報: 未設定');
  });

  it('storage の開催状況・URLを本文に反映する', async () => {
    const interaction = makeInteraction();

    await handleStatusCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('YES（木曜19時に事前告知を自動投稿）');
    expect(message).toContain('https://x.com/foo/status/1');
    expect(message).toContain('https://vrchat.com/i/abc');
  });
});
