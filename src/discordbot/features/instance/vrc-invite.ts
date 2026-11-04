import { ButtonBuilder, ButtonInteraction, ButtonStyle } from 'discord.js';
import { buildCustomId } from '../../interactions';
import { formatError, requireOperatorRole } from '../../shared/interaction';
import { instanceNameOf, readLatest } from './vrc-launcher';
import { vrcLinkStore } from './vrc-links';
import { AuthError, inviteToInstance, InviteOutcome } from '../../../vrchat/createInstance';

/**
 * /create-instance の結果に付ける「📨 自分に招待」ボタン。押した人の VRChat アカウント（/vrc-link で登録したもの）に、
 * そのインスタンスへの招待を送る。作成時の招待が流れてしまったときや、作成した人以外の運営が入るときに使う。
 * 引数はインスタンス名。「サブアカウントで入る」と同じく、最新のインスタンスのボタンだけを受け付ける。
 */
export const VRC_INVITE_ME_BUTTON = 'vrc:invite-me';

/**
 * 招待の結果を人が読める形にする。招待できたぶんは 1 行にまとめ、
 * フレンドでなかった相手や失敗したぶんだけ理由を個別に出す。
 * /create-instance の結果と「📨 自分に招待」ボタンの返信で使う。
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

export function inviteMeButton(location: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(buildCustomId(VRC_INVITE_ME_BUTTON, instanceNameOf(location)))
    .setLabel('📨 自分に招待')
    .setStyle(ButtonStyle.Secondary);
}

export async function handleInviteMeButton(interaction: ButtonInteraction, args: string[]) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;

  const latest = readLatest();
  if (!latest || instanceNameOf(latest.location) !== args[0]) {
    await interaction.reply({
      content: 'ℹ️ このボタンのインスタンスは、その後に作成したインスタンスに置き換わっています。最新の /create-instance の結果から押してください。',
      ephemeral: true,
    });
    return;
  }

  const link = vrcLinkStore.get(interaction.user.id);
  if (!link) {
    await interaction.reply({
      content: 'ℹ️ VRChat アカウントが未登録です。`/vrc-link set` にプロフィールURLを貼って登録してから、もう一度押してください。',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const outcome = await inviteToInstance(latest.world_id, latest.instance_id, { userId: link.vrcUserId, label: 'あなた' });
    await interaction.editReply(describeInvites([outcome]).join('\n'));
  } catch (error) {
    console.error('handleInviteMeButton failed:', error);
    await interaction.editReply(error instanceof AuthError ? `❌ VRChat 認証エラー: ${error.message}` : formatError(error));
  }
}
