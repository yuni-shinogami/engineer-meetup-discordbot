import { join } from 'path';
import { readFileSync } from 'fs';
import { formatSlashDate, upcomingMeetupDates } from '../discordbot/lt/dates';
import { postTweetWithImage } from './xBot';

const ASSETS_DIR = join(__dirname, 'assets');

export async function postAnnouncement(isProd: boolean): Promise<string> {
  // 開催日の算出は LT 側と同じ `MEETUP_WEEKDAY` に従わせる（曜日の定義を二重に持たない）
  const dateStr = formatSlashDate(upcomingMeetupDates(1)[0] ?? '');
  const templatePath = join(ASSETS_DIR, 'announcement_template.txt');
  const template = readFileSync(templatePath, 'utf-8');
  const text = template.replace('{date}', dateStr);
  const imagePath = join(ASSETS_DIR, 'engineer_for_post_X_3_4.jpg');
  console.log(`Posting announcement (${isProd ? '本番' : 'テスト'}) for ${dateStr}...`);
  return postTweetWithImage(text, imagePath, isProd);
}
