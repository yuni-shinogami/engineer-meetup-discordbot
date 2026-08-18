import { config } from '../discordbot/config';

/**
 * ツイート ID から投稿 URL を組み立てる。
 * アカウント名が未設定のときは ID をそのまま返す（リンクにはならないが情報は残る）。
 */
export function xPostUrl(tweetId: string, isProd: boolean): string {
  const account = isProd ? config.xAccount : config.testXAccount;
  return account ? `https://x.com/${account}/status/${tweetId}` : tweetId;
}
