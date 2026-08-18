import { SlashCommandBuilder, ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { config } from '../config';
import { storage } from '../storage';
import { requireOperatorRole } from './utils';
import { postGroupAnnouncement, AuthError } from '../../vrchat/postGroupAnnouncement';
import { postQuoteAnnouncement } from '../../x/quotePost';
import { xPostUrl } from '../../x/postUrl';
import { formatMeetupDate } from '../lt/dates';
import { MEETUP_DAY_TARGETS } from '../lt/announce';
import { nextMeetupDate, runWeeklyLtAnnounce } from '../lt/weekly-announce';

export const postAnnouncementCommand = new SlashCommandBuilder()
  .setName('post-announcement')
  .setDescription('エンジニア集会の開催告知を全チャンネルに投稿します（X引用RT・Discord・VRCGroup）')
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番環境で実行する場合はTrueにしてください（デフォルトはFalse: テストモード）')
  )
  .addBooleanOption(option =>
    option.setName('lt-only')
      .setDescription('LT告知（Discord・VRCGroup）だけを投稿します（開催告知は出しません）')
  )
  .addBooleanOption(option =>
    option.setName('skip-lt')
      .setDescription('当日のLT告知を同時に投稿しない場合はTrueにしてください')
  );

export async function handlePostAnnouncementCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply();

  const isProd = interaction.options.getBoolean('production') ?? false;
  const ltOnly = interaction.options.getBoolean('lt-only') ?? false;
  const skipLt = interaction.options.getBoolean('skip-lt') ?? false;

  if (ltOnly && skipLt) {
    await interaction.editReply('❌ `lt-only` と `skip-lt` は同時に指定できません。');
    return;
  }

  if (ltOnly) {
    // LT 告知はインスタンスに依存しないので、招待 URL が無くても実行できる
    await interaction.editReply(`LT 告知を確認しています (${isProd ? '本番' : 'テスト'}モード)...`);
    const report = await runWeeklyLtAnnounce(interaction.client, isProd, {
      force: true,
      targets: MEETUP_DAY_TARGETS,
    });
    await interaction.editReply(report ?? [
      `ℹ️ ${formatMeetupDate(nextMeetupDate())} に確定している LT はありません。(${isProd ? '本番' : 'テスト'})`,
      '　運営ボタンで日程を確定すると対象になります。',
    ].join('\n'));
    return;
  }

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
      steps.push(`✅ X告知: ${xPostUrl(quoteTweetId, isProd)}`);
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

  // 4. LT 告知（Discord・VRChat グループ）。週次の告知とは別メッセージで、当日出す運用。
  //    週次の告知が失敗していても LT は独立して出す。
  const ltReport = skipLt ? null : await runWeeklyLtAnnounce(interaction.client, isProd, {
    targets: MEETUP_DAY_TARGETS,
  });

  const resultMessage = [
    hasError ? '⚠️ 一部の告知でエラーが発生しました' : `✅ 告知が完了しました！ (${isProd ? '本番' : 'テスト'})`,
    '',
    ...steps,
    '',
    `**招待URL:** ${inviteUrl}`,
    ...(ltReport ? ['', ltReport] : []),
  ].join('\n');

  await interaction.editReply(resultMessage);

  if (!hasError) {
    storage.isScheduled = false;
    storage.lastTweetId = null;
    storage.preAnnouncePostUrl = null;
  }
}
