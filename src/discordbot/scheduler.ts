import { Client, TextChannel } from 'discord.js';
import cron from 'node-cron';
import { config } from './config';
import { storage } from './storage';
import { sendConfirmMeetupToChannel, executePreAnnounce } from './meetup';
import { PRE_ANNOUNCE_TARGETS } from './lt/announce';
import { runWeeklyLtAnnounce } from './lt/weekly-announce';

export const CRON_SCHEDULES = [
  {
    label: '開催確認',
    expr: process.env.CONFIRM_CRON ?? '0 12 * * 4',
    description: '運営チャンネルに YES/NO ボタンを送信',
  },
  {
    label: '事前告知',
    expr: process.env.PRE_ANNOUNCE_CRON ?? '0 19 * * 4',
    description: '開催予定 YES のときのみ実行（翌日の LT 告知も同時に投稿）',
  },
] as const;

export function setupScheduler(client: Client) {
  cron.schedule(CRON_SCHEDULES[0].expr, async () => {
    await triggerConfirmMeetup(client);
  });

  cron.schedule(CRON_SCHEDULES[1].expr, async () => {
    await triggerPreAnnounce(client);
  });
}

export async function triggerConfirmMeetup(client: Client, isProd = true) {
  const channelId = isProd ? config.operationsChannelId : config.testChannelId;
  await sendConfirmMeetupToChannel(client, channelId);
}

export async function triggerPreAnnounce(client: Client, isProd = true) {
  if (!storage.isScheduled) {
    console.log('Meetup is not scheduled for this week. Skipping pre-announce.');
    return;
  }

  const opChannelId = isProd ? config.operationsChannelId : config.testChannelId;

  const notifyOps = async (content: string) => {
    try {
      const opChannel = await client.channels.fetch(opChannelId) as TextChannel | null;
      await opChannel?.send(content);
    } catch (error) {
      console.error('Failed to notify operations channel:', error);
    }
  };

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
