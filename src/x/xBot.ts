import { readFile } from 'fs/promises';
import { basename } from 'path';

/**
 * X の API を x-gateway 経由で呼ぶ。
 *
 * アカウントの鍵（API キー・アクセストークン）はゲートウェイがまとめて持ち、呼び出しごとに署名するので、
 * Bot はゲートウェイのトークンだけを送る。ゲートウェイは Bot に許した API とアカウントだけを X に中継し、
 * それ以外は 403 を返す。パスは X API と同じ（`/2/tweets` など）。
 */
const PROD_ACCOUNT = 'engineer-meetup';
const TEST_ACCOUNT = 'engineer-meetup-test';

async function callX(path: string, init: RequestInit, isProd: boolean): Promise<any> {
  const url = process.env['X_GATEWAY_URL'];
  const token = process.env['X_GATEWAY_TOKEN'];
  if (!url || !token) {
    throw new Error('X_GATEWAY_URL / X_GATEWAY_TOKEN が設定されていません');
  }

  if (!isProd) console.log('[xBot] テストアカウントを使用');
  const account = isProd ? PROD_ACCOUNT : TEST_ACCOUNT;
  const res = await fetch(`${url.replace(/\/+$/, '')}/x/${account}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);

  if (res.status === 403 && data?.error === 'forbidden') {
    throw new Error(
      `x-gateway に断られました（${data.message ?? ''}）。X_GATEWAY_TOKEN と、ゲートウェイの clients.json を確認してください。`,
    );
  }
  if (!res.ok) {
    throw new Error(`X API の呼び出しに失敗しました (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function tweet(body: object, isProd: boolean): Promise<string> {
  const data = await callX('/2/tweets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, isProd);
  return data.data.id;
}

async function uploadMedia(imagePath: string, isProd: boolean): Promise<string> {
  const form = new FormData();
  form.append('media', new Blob([await readFile(imagePath)]), basename(imagePath));
  form.append('media_category', 'tweet_image');
  const data = await callX('/2/media/upload', { method: 'POST', body: form }, isProd);
  return data.data.id;
}

export async function postTweet(text: string, isProd: boolean): Promise<string> {
  const id = await tweet({ text }, isProd);
  console.log('ツイート成功:', id);
  return id;
}

export async function postTweetWithImage(text: string, imagePath: string, isProd: boolean): Promise<string> {
  const mediaId = await uploadMedia(imagePath, isProd);
  const id = await tweet({ text, media: { media_ids: [mediaId] } }, isProd);
  console.log('画像付きツイート成功:', id);
  return id;
}

export async function quoteTweet(text: string, quoteTweetId: string, isProd: boolean): Promise<string> {
  const id = await tweet({ text, quote_tweet_id: quoteTweetId }, isProd);
  console.log('引用リツイート成功:', id);
  return id;
}

/** ユーザー名からユーザーを引く。fields は `user.fields` に渡す項目 */
export async function fetchUserByUsername(
  username: string,
  fields: string[],
  isProd: boolean,
): Promise<Record<string, any> | null> {
  const query = new URLSearchParams({ 'user.fields': fields.join(',') });
  const data = await callX(`/2/users/by/username/${encodeURIComponent(username)}?${query}`, { method: 'GET' }, isProd);
  return data?.data ?? null;
}
