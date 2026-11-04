import { join } from 'path';
import { readFileSync } from 'fs';
import { postTweetWithImage } from './xBot';

const ASSETS_DIR = join(__dirname, 'assets');

/**
 * 事前告知を画像付きで投稿し、ツイート ID を返す。
 * dateStr は告知文の {date} に入れる開催日（'YYYY/MM/DD'）。開催日の決め方は Bot の側が持つ。
 */
export async function postAnnouncement(dateStr: string, isProd: boolean): Promise<string> {
  const templatePath = join(ASSETS_DIR, 'announcement_template.txt');
  const template = readFileSync(templatePath, 'utf-8');
  const text = template.replace('{date}', dateStr);
  const imagePath = join(ASSETS_DIR, 'engineer_for_post_X_3_4.jpg');
  console.log(`Posting announcement (${isProd ? '本番' : 'テスト'}) for ${dateStr}...`);
  return postTweetWithImage(text, imagePath, isProd);
}
