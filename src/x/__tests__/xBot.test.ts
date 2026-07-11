import { describe, it, expect, afterEach, vi } from 'vitest';

const { tweetMock, TwitterApiMock } = vi.hoisted(() => {
  const tweetMock = vi.fn().mockResolvedValue({ data: { id: 'tweet-id' } });
  const TwitterApiMock = vi.fn().mockImplementation(function TwitterApi() {
    return { readWrite: { v2: { tweet: tweetMock } } };
  });
  return { tweetMock, TwitterApiMock };
});

vi.mock('twitter-api-v2', () => ({
  TwitterApi: TwitterApiMock,
}));

import { postTweet } from '../xBot';

// createClient() は xBot.ts の内部関数のため、資格情報のバリデーション/出し分けは
// postTweet() 経由で検証する。twitter-api-v2 はモックしているので実際の
// ネットワーク通信は発生しない。
describe('xBot createClient（本番/テストアカウントの資格情報バリデーションと出し分け）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    TwitterApiMock.mockClear();
    tweetMock.mockClear();
  });

  it('isProd: true で本番用の資格情報が一つでも欠けていればエラーになる', async () => {
    vi.stubEnv('X_API_KEY', 'key');
    vi.stubEnv('X_API_SECRET', 'secret');
    vi.stubEnv('X_ACCESS_TOKEN', 'token');
    vi.stubEnv('X_ACCESS_SECRET', '');

    await expect(postTweet('text', true)).rejects.toThrow('X API credentials missing for 本番アカウント');
    expect(TwitterApiMock).not.toHaveBeenCalled();
  });

  it('isProd: false でテスト用の資格情報が一つでも欠けていればエラーになる', async () => {
    vi.stubEnv('TEST_X_API_KEY', 'key');
    vi.stubEnv('TEST_X_API_SECRET', '');
    vi.stubEnv('TEST_X_ACCESS_TOKEN', 'token');
    vi.stubEnv('TEST_X_ACCESS_SECRET', 'tSecret');

    await expect(postTweet('text', false)).rejects.toThrow('X API credentials missing for テストアカウント');
    expect(TwitterApiMock).not.toHaveBeenCalled();
  });

  it('isProd: true のときは本番用 (X_*) の資格情報でクライアントを作る', async () => {
    vi.stubEnv('X_API_KEY', 'prod-key');
    vi.stubEnv('X_API_SECRET', 'prod-secret');
    vi.stubEnv('X_ACCESS_TOKEN', 'prod-token');
    vi.stubEnv('X_ACCESS_SECRET', 'prod-tsecret');

    await postTweet('text', true);

    expect(TwitterApiMock).toHaveBeenCalledWith({
      appKey: 'prod-key',
      appSecret: 'prod-secret',
      accessToken: 'prod-token',
      accessSecret: 'prod-tsecret',
    });
  });

  it('isProd: false のときはテスト用 (TEST_X_*) の資格情報でクライアントを作る', async () => {
    vi.stubEnv('TEST_X_API_KEY', 'test-key');
    vi.stubEnv('TEST_X_API_SECRET', 'test-secret');
    vi.stubEnv('TEST_X_ACCESS_TOKEN', 'test-token');
    vi.stubEnv('TEST_X_ACCESS_SECRET', 'test-tsecret');

    await postTweet('text', false);

    expect(TwitterApiMock).toHaveBeenCalledWith({
      appKey: 'test-key',
      appSecret: 'test-secret',
      accessToken: 'test-token',
      accessSecret: 'test-tsecret',
    });
  });
});
