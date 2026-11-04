import { ActionRowBuilder, ButtonBuilder, SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { config } from '../config';
import { storage } from '../storage';
import { vrcLinkStore } from '../vrc-links';
import { isVrcLauncherConfigured, joinSubButton } from '../vrc-launcher';
import { isLtRecorderConfigured, ltRecordStartButton, radioPrepButton } from '../lt-recorder';
import { describeInvites, inviteMeButton } from '../vrc-invite';
import { requireOperatorRole, formatError } from '../shared/interaction';
import {
  AuthError,
  createInstance,
  InviteTarget,
} from '../../vrchat/createInstance';

export const createInstanceCommand = new SlashCommandBuilder()
  .setName('create-instance')
  .setDescription('VRChat インスタンスを作成し、招待URLを取得します（告知は行いません）')
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番環境で実行する場合はTrueにしてください（デフォルトはFalse: テストモード）')
  );

export async function handleCreateInstanceCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply();

  const isProd = interaction.options.getBoolean('production') ?? false;
  const link = vrcLinkStore.get(interaction.user.id);
  const extraInvites: InviteTarget[] = link
    ? [{ userId: link.vrcUserId, label: 'あなた' }]
    : [];

  try {
    await interaction.editReply(`インスタンスを起動しています (${isProd ? '🚀本番' : '🧪テスト'}モード)...`);
    const result = await createInstance(isProd, config.vrcStateDir, { extraInvites });
    console.log(`Instance created: ${result.inviteUrl}`);

    storage.lastInviteUrl = result.inviteUrl;

    const lines = [
      `✅ インスタンスが作成されました！ (${isProd ? '本番' : 'テスト'})`,
      '',
      `**招待URL:** ${result.inviteUrl}`,
      ...describeInvites(result.invites),
    ];
    if (!link) {
      lines.push(
        'ℹ️ VRChat アカウントが未登録のため、あなたへの招待はスキップしました。',
        '`/vrc-link set` にプロフィールURLを貼って登録すると、次回から自動で招待が飛びます。',
      );
    }

    const buttons = [
      inviteMeButton(result.location),
      ...(isVrcLauncherConfigured() ? [joinSubButton(result.location)] : []),
      ...(isLtRecorderConfigured() ? [ltRecordStartButton(result.location, isProd), radioPrepButton(result.location)] : []),
    ];
    await interaction.editReply({
      content: lines.join('\n'),
      components: buttons.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [],
    });
  } catch (error) {
    console.error('handleCreateInstanceCommand failed:', error);
    if (error instanceof AuthError) {
      await interaction.editReply(`❌ VRChat 認証エラー: ${error.message}`);
    } else {
      await interaction.editReply(formatError(error));
    }
  }
}
