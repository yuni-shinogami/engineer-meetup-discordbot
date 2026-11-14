import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { fetchUserByUsername, postTweet, postTweetWithImage, quoteTweet } from '../xBot';

// fetch をモックしているので、x-gateway にも X にも繋がない
const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe('xBot（x-gateway 経由の X API 呼び出し）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('X_GATEWAY_URL', 'http://gateway.example:8080/');
    vi.stubEnv('X_GATEWAY_TOKEN', 'gw-token');
    fetchMock.mockImplementation(() => reply(201, { data: { id: 'tweet-id' } }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('isProd で本番／テストのアカウントを選び、ゲートウェイのトークンを付けて投稿する', async () => {
    expect(await postTweet('本番', true)).toBe('tweet-id');
    await postTweet('テスト', false);

    const [prodUrl, prodInit] = fetchMock.mock.calls[0]!;
    const [testUrl] = fetchMock.mock.calls[1]!;
    expect(prodUrl).toBe('http://gateway.example:8080/x/engineer-meetup/2/tweets');
    expect(testUrl).toBe('http://gateway.example:8080/x/engineer-meetup-test/2/tweets');
    expect(prodInit.method).toBe('POST');
    expect(prodInit.headers).toMatchObject({ Authorization: 'Bearer gw-token', 'Content-Type': 'application/json' });
    expect(JSON.parse(prodInit.body)).toEqual({ text: '本番' });
  });

  it('画像をアップロードしてから、その media_id を付けて投稿する', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xbot-'));
    const image = join(dir, 'a.jpg');
    writeFileSync(image, 'jpeg');
    fetchMock
      .mockImplementationOnce(() => reply(200, { data: { id: 'media-id' } }))
      .mockImplementationOnce(() => reply(201, { data: { id: 'tweet-id' } }));

    expect(await postTweetWithImage('画像つき', image, true)).toBe('tweet-id');

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0]!;
    const [, tweetInit] = fetchMock.mock.calls[1]!;
    expect(uploadUrl).toBe('http://gateway.example:8080/x/engineer-meetup/2/media/upload');
    expect((uploadInit.body as FormData).get('media_category')).toBe('tweet_image');
    expect(JSON.parse(tweetInit.body)).toEqual({ text: '画像つき', media: { media_ids: ['media-id'] } });
  });

  it('引用は quote_tweet_id を付けて投稿する', async () => {
    await quoteTweet('引用', 'source-id', true);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ text: '引用', quote_tweet_id: 'source-id' });
  });

  it('ユーザー検索は user.fields をクエリで渡す', async () => {
    fetchMock.mockImplementation(() => reply(200, { data: { profile_image_url: 'https://x/a.jpg' } }));

    expect(await fetchUserByUsername('some one', ['profile_image_url'], false))
      .toEqual({ profile_image_url: 'https://x/a.jpg' });
    expect(fetchMock.mock.calls[0]![0])
      .toBe('http://gateway.example:8080/x/engineer-meetup-test/2/users/by/username/some%20one?user.fields=profile_image_url');
  });

  it('ゲートウェイに断られたら、トークンと clients.json を見るよう伝える', async () => {
    fetchMock.mockImplementation(() => reply(403, { error: 'forbidden', message: 'POST /engineer-meetup/2/tweets は許していません' }));

    await expect(postTweet('text', true)).rejects.toThrow(/X_GATEWAY_TOKEN と、ゲートウェイの clients.json/);
  });

  it('X が失敗を返したら、ステータスと本文をエラーにする', async () => {
    fetchMock.mockImplementation(() => reply(402, { title: 'CreditsDepleted' }));

    await expect(postTweet('text', true)).rejects.toThrow('(402): {"title":"CreditsDepleted"}');
  });

  it('ゲートウェイの設定がなければ呼ばずにエラーにする', async () => {
    vi.stubEnv('X_GATEWAY_TOKEN', '');

    await expect(postTweet('text', true)).rejects.toThrow('X_GATEWAY_URL / X_GATEWAY_TOKEN が設定されていません');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
