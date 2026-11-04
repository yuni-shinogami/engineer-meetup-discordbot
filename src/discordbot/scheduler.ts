import { Client } from 'discord.js';
import cron from 'node-cron';
import { triggerConfirmMeetup, triggerPreAnnounce } from './features/meetup/index';

export const CRON_SCHEDULES = [
  {
    label: '開催確認',
    expr: process.env.CONFIRM_CRON ?? '0 12 * * 1',
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
