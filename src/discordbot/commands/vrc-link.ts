import { ChatInputCommandInteraction, SlashCommandBuilder, User } from 'discord.js';
import { config } from '../config';
import { vrcLinkStore } from '../vrc-links';
import { parseVrchatProfile, profileUrl, VrcLink } from '../../vrchat/links';
import { getUser } from '../../vrchat/api/user';
import {
  acceptIncomingFriendRequest,
  getFriendStatus,
  sendFriendRequest,
} from '../../vrchat/api/friends';
import { AuthError, withSession } from '../../vrchat/session';
import { VRChatClient } from '../../vrchat/api/client';
import { formatError, requireOperatorRole } from './utils';

const PROFILE_EXAMPLE = 'https://vrchat.com/home/user/usr_...';

export const vrcLinkCommand = new SlashCommandBuilder()
  .setName('vrc-link')
  .setDescription('VRChat アカウントを登録して、インスタンス作成時に招待を受け取れるようにします')
  .addSubcommand(sub =>
    sub.setName('set')
      .setDescription('VRChat アカウントを登録します')
      .addStringOption(option =>
        option.setName('profile')
          .setDescription(`VRChat のプロフィールURLを貼ってください（例: ${PROFILE_EXAMPLE}）`)
          .setRequired(true)
      )
      .addUserOption(option =>
        option.setName('user')
          .setDescription('代理登録する相手（省略時は自分）')
      )
  )
  .addSubcommand(sub =>
    sub.setName('show')
      .setDescription('登録済みの VRChat アカウントとフレンド状態を表示します')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('確認する相手（省略時は自分）')
      )
  )
  .addSubcommand(sub =>
    sub.setName('clear')
      .setDescription('登録を解除します（フレンド関係はそのまま）')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('解除する相手（省略時は自分）')
      )
  );

/** 「あなた」か「<@id>」か。代理登録のときに誰の話かをはっきりさせる。 */
function targetLabel(target: User, actor: User): string {
  return target.id === actor.id ? 'あなた' : `<@${target.id}>`;
}

export async function handleVrcLinkCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  if (interaction.deferred || interaction.replied) return;

  // VRChat API を叩くので時間がかかる。VRChat ID は他のメンバーに見せる必要がないので ephemeral。
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('user') ?? interaction.user;

  try {
    switch (interaction.options.getSubcommand()) {
      case 'set':
        await handleSet(interaction, target);
        return;
      case 'show':
        await handleShow(interaction, target);
        return;
      case 'clear':
        await handleClear(interaction, target);
        return;
      default:
        await interaction.editReply('❌ 不明なサブコマンドです。');
    }
  } catch (error) {
    console.error('handleVrcLinkCommand failed:', error);
    if (error instanceof AuthError) {
      await interaction.editReply(`❌ VRChat 認証エラー: ${error.message}`);
    } else {
      await interaction.editReply(formatError(error));
    }
  }
}

async function handleSet(interaction: ChatInputCommandInteraction, target: User) {
  const parsed = parseVrchatProfile(interaction.options.getString('profile', true));
  if (!parsed.ok) {
    await interaction.editReply(`❌ ${parsed.error}`);
    return;
  }

  const who = targetLabel(target, interaction.user);

  const message = await withSession(config.vrcStateDir, async ({ client, user }) => {
    const vrcUser = await getUser(client, parsed.userId);
    if (!vrcUser) {
      return `❌ その VRChat ユーザーは見つかりませんでした: \`${parsed.userId}\`\nプロフィールのURLを貼り直してください（例: ${PROFILE_EXAMPLE}）`;
    }

    // 以降のフレンド処理が失敗しても登録自体は残す
    vrcLinkStore.set(target.id, {
      vrcUserId: vrcUser.id,
      displayName: vrcUser.displayName,
      linkedBy: interaction.user.id,
    });

    const lines = [
      `✅ **${vrcUser.displayName}** を ${who} の VRChat アカウントとして登録しました。`,
      profileUrl(vrcUser.id),
      '',
    ];

    // フレンド処理が落ちても登録は済んでいる。エラーで応答ごと差し替えず、1 行の警告に留める
    try {
      lines.push(await ensureFriend(client, user.displayName, vrcUser.id, target.id));
    } catch (e) {
      console.error('[vrc-link] friend handling failed:', e);
      lines.push(
        `⚠️ フレンド状態を確認できませんでした（${e instanceof Error ? e.message : String(e)}）。`,
        '登録自体は完了しています。`/vrc-link show` で確認できます。',
      );
    }
    return lines.join('\n');
  });

  await interaction.editReply(message);
}

/**
 * フレンドでなければ申請を送り、結果を 1 行の文面で返す。
 *
 * VRChat API はフレンド申請にメッセージを添えられない（エンドポイントがリクエストボディを持たない）ので、
 * 「誰からの申請か」はこの文面で伝えるしかない。
 */
async function ensureFriend(
  client: VRChatClient,
  senderName: string,
  vrcUserId: string,
  targetDiscordId: string,
): Promise<string> {
  const status = await getFriendStatus(client, vrcUserId);

  if (status.isFriend) {
    return `すでに **${senderName}** とフレンドなので、\`/create-instance\` で招待が飛びます。`;
  }

  if (status.incomingRequest && await acceptIncomingFriendRequest(client, vrcUserId)) {
    return `届いていたフレンド申請を **${senderName}** で承認しました。\`/create-instance\` で招待が飛びます。`;
  }

  // 送信済みなら送り直さない（API も 400 を返す）
  if (status.outgoingRequest) {
    return `⏳ **${senderName}** からのフレンド申請が承認待ちです。VRChat で承認してください。`;
  }

  const result = await sendFriendRequest(client, vrcUserId);
  vrcLinkStore.markFriendRequestSent(targetDiscordId);
  return result === 'sent'
    ? `📨 **${senderName}** からフレンド申請を送りました。VRChat で承認すると招待が届くようになります。`
    : `⏳ **${senderName}** からのフレンド申請が承認待ちです。VRChat で承認してください。`;
}

async function handleShow(interaction: ChatInputCommandInteraction, target: User) {
  const who = targetLabel(target, interaction.user);
  const link = vrcLinkStore.get(target.id);

  if (!link) {
    await interaction.editReply(
      `ℹ️ ${who} の VRChat アカウントは未登録です。\n\`/vrc-link set\` にプロフィールURLを貼って登録してください（例: ${PROFILE_EXAMPLE}）`,
    );
    return;
  }

  const lines = describeLink(who, link);

  // フレンド状態はキャッシュせず毎回引く。取れなくても登録内容は見せる。
  try {
    const friendLine = await withSession(config.vrcStateDir, async ({ client, user }) => {
      const status = await getFriendStatus(client, link.vrcUserId);
      if (status.isFriend) return `フレンド: ✅ **${user.displayName}** とフレンド（招待が飛びます）`;
      if (status.outgoingRequest) return `フレンド: ⏳ **${user.displayName}** からの申請が承認待ち`;
      if (status.incomingRequest) return `フレンド: 📥 相手から申請が届いています（\`/vrc-link set\` で承認できます）`;
      return `フレンド: ❌ 未フレンド（\`/vrc-link set\` で申請を送れます）`;
    });
    lines.push(friendLine);
  } catch (e) {
    lines.push(`フレンド: ⚠️ 確認できませんでした（${e instanceof Error ? e.message : String(e)}）`);
  }

  await interaction.editReply(lines.join('\n'));
}

function describeLink(who: string, link: VrcLink): string[] {
  const lines = [
    `**${link.displayName}** — ${who} の VRChat アカウント`,
    profileUrl(link.vrcUserId),
    `登録: ${link.linkedAt.slice(0, 10)}`,
  ];
  if (link.linkedBy !== '') lines.push(`登録操作: <@${link.linkedBy}>`);
  return lines;
}

async function handleClear(interaction: ChatInputCommandInteraction, target: User) {
  const who = targetLabel(target, interaction.user);
  const link = vrcLinkStore.get(target.id);

  if (!vrcLinkStore.remove(target.id)) {
    await interaction.editReply(`ℹ️ ${who} の VRChat アカウントは登録されていません。`);
    return;
  }

  await interaction.editReply(
    `🗑️ ${who} の登録（**${link?.displayName ?? '不明'}**）を解除しました。\n`
    + 'フレンド関係と送信済みのフレンド申請はそのままです。解除したい場合は VRChat 側で操作してください。',
  );
}
