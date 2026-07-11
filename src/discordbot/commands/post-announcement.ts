import { SlashCommandBuilder, ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { config } from '../config';
import { storage } from '../storage';
import { requireOperatorRole } from './utils';
import { postGroupAnnouncement, AuthError } from '../../vrchat/postGroupAnnouncement';
import { postQuoteAnnouncement } from '../../x/quotePost';

export const postAnnouncementCommand = new SlashCommandBuilder()
  .setName('post-announcement')
  .setDescription('エンジニア集会の開催告知を全チャンネルに投稿します（X引用RT・Discord・VRCGroup）')
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番環境で実行する場合はTrueにしてください（デフォルトはFalse: テストモード）')
  );

export async function handlePostAnnouncementCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply();

  const isProd = interaction.options.getBoolean('production') ?? false;

  const inviteUrl = storage.lastInviteUrl;
  if (!inviteUrl) {
    await interaction.editReply('❌ インスタンスの招待URLが見つかりません。先に `/create-instance` を実行してください。');
    return;
  }

  const steps: string[] = [];
  let hasError = false;

  await interaction.editReply('告知を投稿しています...');

  // 1. X quote RT
  if (!storage.lastTweetId) {
    steps.push('⚠️ X告知: スキップ（事前告知未実施 — `/pre-announce` を先に実行してください）');
  } else {
    try {
      const quoteTweetId = await postQuoteAnnouncement(inviteUrl, storage.lastTweetId, isProd);
      const xAccount = isProd ? config.xAccount : config.testXAccount;
      const quoteTweetUrl = xAccount ? `https://x.com/${xAccount}/status/${quoteTweetId}` : quoteTweetId;
      steps.push(`✅ X告知: ${quoteTweetUrl}`);
    } catch (error) {
      console.error('X quote RT failed:', error);
      steps.push(`❌ X告知: 失敗 — ${error instanceof Error ? error.message : String(error)}`);
      hasError = true;
    }
  }

  // 2. Discord announcement
  try {
    const announceChannelId = isProd ? config.publicChannelId : config.testChannelId;
    if (!announceChannelId) {
      steps.push('⏭️ Discord告知: スキップ（チャンネル未設定）');
    } else {
      const rolePing = config.announceRoleId ? `<@&${config.announceRoleId}>` : '';
      const announceMessage = [
        rolePing,
        'エンジニア集会始めるよー！',
        'インスタンス立てたよ―！良かったら遊びに来てねーー！',
        storage.preAnnouncePostUrl,
        inviteUrl,
      ].filter(Boolean).join('\n');

      const announceChannel = await interaction.client.channels.fetch(announceChannelId) as TextChannel;
      if (announceChannel) {
        await announceChannel.send(announceMessage);
        steps.push('✅ Discord告知: 投稿完了');
      }
    }
  } catch (error) {
    console.error('Discord announcement failed:', error);
    steps.push(`❌ Discord告知: 失敗 — ${error instanceof Error ? error.message : String(error)}`);
    hasError = true;
  }

  // 3. VRC Group announcement
  if (!config.vrcStateDir) {
    steps.push('⏭️ VRCGroup告知: スキップ（VRC_STATE_DIR 未設定）');
  } else {
    try {
      await postGroupAnnouncement(isProd, config.vrcStateDir);
      steps.push('✅ VRCGroup告知: 投稿完了');
    } catch (error) {
      console.error('VRCGroup announcement failed:', error);
      if (error instanceof AuthError) {
        steps.push(`❌ VRCGroup告知: 認証エラー — ${error.message}`);
      } else {
        steps.push(`❌ VRCGroup告知: 失敗 — ${error instanceof Error ? error.message : String(error)}`);
      }
      hasError = true;
    }
  }

  const resultMessage = [
    hasError ? '⚠️ 一部の告知でエラーが発生しました' : `✅ 告知が完了しました！ (${isProd ? '本番' : 'テスト'})`,
    '',
    ...steps,
    '',
    `**招待URL:** ${inviteUrl}`,
  ].join('\n');

  await interaction.editReply(resultMessage);

  if (!hasError) {
    storage.isScheduled = false;
    storage.lastTweetId = null;
    storage.preAnnouncePostUrl = null;
  }
}
