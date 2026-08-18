import { TwitterApi } from 'twitter-api-v2';

function createClient(isProd: boolean): TwitterApi {
  const key    = isProd ? process.env['X_API_KEY']         : process.env['TEST_X_API_KEY'];
  const secret = isProd ? process.env['X_API_SECRET']      : process.env['TEST_X_API_SECRET'];
  const token  = isProd ? process.env['X_ACCESS_TOKEN']    : process.env['TEST_X_ACCESS_TOKEN'];
  const tSecret= isProd ? process.env['X_ACCESS_SECRET']   : process.env['TEST_X_ACCESS_SECRET'];

  if (!key || !secret || !token || !tSecret) {
    throw new Error(`X API credentials missing for ${isProd ? '本番' : 'テスト'}アカウント`);
  }

  if (!isProd) console.log('[xBot] テストアカウントを使用');
  return new TwitterApi({ appKey: key, appSecret: secret, accessToken: token, accessSecret: tSecret });
}

export { createClient as createXClient };

export async function postTweet(text: string, isProd: boolean): Promise<string> {
  const client = createClient(isProd);
  const result = await client.readWrite.v2.tweet(text);
  console.log('ツイート成功:', result.data.id);
  return result.data.id;
}

export async function postTweetWithImage(text: string, imagePath: string, isProd: boolean): Promise<string> {
  const client = createClient(isProd);
  const mediaId = await client.v1.uploadMedia(imagePath);
  const result = await client.readWrite.v2.tweet({ text, media: { media_ids: [mediaId] } });
  console.log('画像付きツイート成功:', result.data.id);
  return result.data.id;
}

export async function quoteTweet(text: string, quoteTweetId: string, isProd: boolean): Promise<string> {
  const client = createClient(isProd);
  const result = await client.readWrite.v2.tweet({ text, quote_tweet_id: quoteTweetId });
  console.log('引用リツイート成功:', result.data.id);
  return result.data.id;
}
