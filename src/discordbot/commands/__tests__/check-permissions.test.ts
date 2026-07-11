import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';

vi.mock('../../config', () => ({
  config: {
    operatorRoleId: 'operator-role',
    operationsChannelId: 'ops-id',
    publicChannelId: 'public-id',
    testChannelId: 'test-id',
  },
}));

import { handleCheckPermissionsCommand } from '../check-permissions';
import { config } from '../../config';
import type { ChatInputCommandInteraction } from 'discord.js';

function makeChannel(hasFlags: bigint[]) {
  return {
    guild: { members: { me: {} } },
    permissionsFor: vi.fn().mockReturnValue({
      has: (flag: bigint) => hasFlags.includes(flag),
    }),
  };
}

function makeInteraction(fetchImpl: (id: string) => unknown, memberRoles = ['operator-role']) {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn(fetchImpl);
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
    fetch: typeof fetch;
  };
}

describe('handleCheckPermissionsCommand', () => {
  afterEach(() => {
    config.testChannelId = 'test-id';
  });

  it('必須・推奨権限がすべて揃っていれば ✅ になる', async () => {
    const channel = makeChannel([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.MentionEveryone,
    ]);
    const interaction = makeInteraction(async () => channel);

    await handleCheckPermissionsCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('✅ ViewChannel（閲覧）');
    expect(message).toContain('✅ SendMessages（メッセージ送信）');
    expect(message).toContain('✅ EmbedLinks（リンク埋め込み）');
  });

  it('必須権限が欠けていれば ❌ になる', async () => {
    const channel = makeChannel([]);
    const interaction = makeInteraction(async () => channel);

    await handleCheckPermissionsCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('❌ ViewChannel（閲覧）');
    expect(message).toContain('❌ SendMessages（メッセージ送信）');
  });

  it('推奨権限のみ欠けている場合は ⚠️ になる（必須ではないため ❌ にはならない）', async () => {
    const channel = makeChannel([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
    const interaction = makeInteraction(async () => channel);

    await handleCheckPermissionsCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('⚠️ EmbedLinks（リンク埋め込み）');
    expect(message).toContain('⚠️ MentionEveryone（ロールping）');
  });

  it('チャンネルIDが未設定の場合は未設定と表示する', async () => {
    config.testChannelId = '';
    const channel = makeChannel([PermissionFlagsBits.ViewChannel]);
    const interaction = makeInteraction(async () => channel);

    await handleCheckPermissionsCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('❌ **テストチャンネル**: 未設定');
  });

  it('Bot のメンバー情報が取得できない場合はエラー表示になる', async () => {
    const channel = { guild: { members: { me: null } }, permissionsFor: vi.fn() };
    const interaction = makeInteraction(async () => channel);

    await handleCheckPermissionsCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('Bot のメンバー情報を取得できませんでした');
  });

  it('チャンネル取得が失敗した場合はエラー表示になる', async () => {
    const interaction = makeInteraction(async () => {
      throw new Error('not found');
    });

    await handleCheckPermissionsCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('チャンネル取得失敗');
  });

  it('権限が無いユーザーが実行した場合は ephemeral な拒否メッセージのみ返す', async () => {
    const interaction = makeInteraction(async () => makeChannel([]), ['other-role']);

    await handleCheckPermissionsCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: '❌ このコマンドを実行する権限がありません。' }),
    );
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });
});
