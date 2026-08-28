import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { config } from '../config';
import { storage } from '../storage';
import { vrcLinkStore } from '../vrc-links';
import { requireOperatorRole, formatError } from './utils';
import {
  AuthError,
  createInstance,
  InviteOutcome,
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

    await interaction.editReply(lines.join('\n'));
  } catch (error) {
    console.error('handleCreateInstanceCommand failed:', error);
    if (error instanceof AuthError) {
      await interaction.editReply(`❌ VRChat 認証エラー: ${error.message}`);
    } else {
      await interaction.editReply(formatError(error));
    }
  }
}

/**
 * 招待の結果を人が読める形にする。招待できたぶんは 1 行にまとめ、
 * フレンドでなかった相手や失敗したぶんだけ理由を個別に出す。
 */
export function describeInvites(invites: InviteOutcome[]): string[] {
  const lines: string[] = [];

  const sent = invites.filter(invite => invite.status === 'sent');
  if (sent.length > 0) {
    lines.push(`📨 招待を送りました: ${sent.map(invite => invite.label).join(' / ')}`);
  }

  for (const invite of invites) {
    switch (invite.status) {
      case 'friend-request-sent':
        lines.push(
          `📨 ${invite.label} はまだフレンドではないので、代わりにフレンド申請を送りました。`
          + 'VRChat で承認すると次回から招待が届きます（今回は招待URLから入室してください）。',
        );
        break;
      case 'pending-approval':
        lines.push(
          `⏳ ${invite.label} へのフレンド申請が承認待ちです。`
          + 'VRChat で承認すると次回から招待が届きます（今回は招待URLから入室してください）。',
        );
        break;
      case 'failed':
        lines.push(`⚠️ ${invite.label} への招待に失敗しました: ${invite.error ?? '原因不明'}`);
        break;
      default:
        break;
    }
  }

  return lines;
}
