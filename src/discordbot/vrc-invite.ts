import { ButtonBuilder, ButtonInteraction, ButtonStyle } from 'discord.js';
import { buildCustomId } from './interactions';
import { formatError, requireOperatorRole } from './commands/utils';
import { describeInvites } from './commands/create-instance';
import { instanceNameOf, readLatest } from './vrc-launcher';
import { vrcLinkStore } from './vrc-links';
import { AuthError, inviteToInstance } from '../vrchat/createInstance';

/**
 * /create-instance の結果に付ける「📨 自分に招待」ボタン。押した人の VRChat アカウント（/vrc-link で登録したもの）に、
 * そのインスタンスへの招待を送る。作成時の招待が流れてしまったときや、作成した人以外の運営が入るときに使う。
 * 引数はインスタンス名。「サブアカウントで入る」と同じく、最新のインスタンスのボタンだけを受け付ける。
 */
export const VRC_INVITE_ME_BUTTON = 'vrc:invite-me';

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
