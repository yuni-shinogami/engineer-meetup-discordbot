import { Client, TextChannel } from 'discord.js';
import { config } from '../../config';
import { storage } from '../../storage';
import { sendConfirmMeetupToChannel, executePreAnnounce } from './meetup';
import { PRE_ANNOUNCE_TARGETS, runWeeklyLtAnnounce } from '../lt/index';

/*
 * 毎週の定期実行（scheduler.ts の cron）と、開催確認の「今すぐ事前告知を投稿する」ボタンから呼ぶ処理。
 */

export async function triggerConfirmMeetup(client: Client, isProd = true) {
  const channelId = isProd ? config.operationsChannelId : config.testChannelId;
  // 定期の開催確認が週の区切り。前の週の回答や見送りを持ち越さない。
  if (isProd) {
    storage.confirmAnswered = false;
    storage.preAnnounceMissed = false;
    storage.vrceveEditUrl = null;
    storage.vrcEvent = null;
    storage.discordEventId = null;
  }
  await sendConfirmMeetupToChannel(client, channelId);
}

export async function triggerPreAnnounce(client: Client, isProd = true) {
  const opChannelId = isProd ? config.operationsChannelId : config.testChannelId;

  const notifyOps = async (content: string) => {
    try {
      const opChannel = await client.channels.fetch(opChannelId) as TextChannel | null;
      await opChannel?.send(content);
    } catch (error) {
      console.error('Failed to notify operations channel:', error);
    }
  };

  if (!storage.isScheduled) {
    console.log('Meetup is not scheduled for this week. Skipping pre-announce.');
    // 開催決定が遅れたときに告知を忘れないよう、見送ったことを覚えておき、
    // 後から YES が押されたら投稿ボタンを出す（confirm-meetup.ts）。
    storage.preAnnounceMissed = true;
    if (!storage.confirmAnswered) {
      const mention = config.operatorRoleId ? `<@&${config.operatorRoleId}> ` : '';
      await notifyOps(
        `${mention}⏰ 開催確認がまだ回答されていないため、事前告知（X）を見送りました。\n`
        + '開催する場合は開催確認で YES を押してください。事前告知を投稿するボタンを出します。',
      );
    }
    return;
  }

  try {
    const postUrl = await executePreAnnounce(isProd);
    console.log(`Pre-announce posted. URL: ${postUrl}`);
    await notifyOps(`事前告知ツイートを投稿しました。\n${postUrl}`);
  } catch (error) {
    console.error('Failed to run pre-announce script:', error);
    await notifyOps('【エラー】事前告知ツイートの投稿に失敗しました。');
  }

  // LT 告知は事前告知とは別の投稿。タイミングだけ揃えているので、
  // 事前告知が失敗しても LT のお知らせは独立して出す。
  // Discord と VRChat は当日の開催告知（/post-announcement）に回すのでここでは出さない。
  const ltReport = await runWeeklyLtAnnounce(client, isProd, { targets: PRE_ANNOUNCE_TARGETS });
  if (ltReport) await notifyOps(ltReport);
}
