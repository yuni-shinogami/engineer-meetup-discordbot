import { Client } from 'discord.js';
import cron from 'node-cron';
import { CRON_SCHEDULES, triggerConfirmMeetup, triggerPreAnnounce } from './features/meetup/index';

export function setupScheduler(client: Client) {
  cron.schedule(CRON_SCHEDULES[0].expr, async () => {
    await triggerConfirmMeetup(client);
  });

  cron.schedule(CRON_SCHEDULES[1].expr, async () => {
    await triggerPreAnnounce(client);
  });
}
