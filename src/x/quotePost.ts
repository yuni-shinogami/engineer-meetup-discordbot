import { join } from 'path';
import { readFileSync } from 'fs';
import { postTweet, quoteTweet } from './xBot';

const ASSETS_DIR = join(__dirname, 'assets');

export async function postQuoteAnnouncement(
  inviteUrl: string,
  tweetId: string | null,
  isProd: boolean,
): Promise<string> {
  const templatePath = join(ASSETS_DIR, 'instance_template.txt');
  const template = readFileSync(templatePath, 'utf-8');
  const text = template.replace('{invite_url}', inviteUrl).trimEnd();

  console.log(`Posting quote announcement (${isProd ? '本番' : 'テスト'})...`);
  return tweetId
    ? quoteTweet(text, tweetId, isProd)
    : postTweet(text, isProd);
}
