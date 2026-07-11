import { join } from 'path';
import { readFileSync } from 'fs';
import { postTweetWithImage } from './xBot';

const ASSETS_DIR = join(__dirname, 'assets');

function getNextFridayDate(): string {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun, 5=Fri
  const diff = dow <= 5 ? 5 - dow : 12 - dow;
  const friday = new Date(now);
  friday.setDate(now.getDate() + diff);
  const y = friday.getFullYear();
  const m = String(friday.getMonth() + 1).padStart(2, '0');
  const d = String(friday.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

export async function postAnnouncement(isProd: boolean): Promise<string> {
  const dateStr = getNextFridayDate();
  const templatePath = join(ASSETS_DIR, 'announcement_template.txt');
  const template = readFileSync(templatePath, 'utf-8');
  const text = template.replace('{date}', dateStr);
  const imagePath = join(ASSETS_DIR, 'engineer_for_post_X_3_4.jpg');
  console.log(`Posting announcement (${isProd ? '本番' : 'テスト'}) for ${dateStr}...`);
  return postTweetWithImage(text, imagePath, isProd);
}
