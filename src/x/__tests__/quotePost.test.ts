import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postQuoteAnnouncement } from '../quotePost';
import { postTweet, quoteTweet } from '../xBot';

vi.mock('../xBot', () => ({
  postTweet: vi.fn().mockResolvedValue('posted-id'),
  quoteTweet: vi.fn().mockResolvedValue('quoted-id'),
}));

const mockedPostTweet = vi.mocked(postTweet);
const mockedQuoteTweet = vi.mocked(quoteTweet);

describe('postQuoteAnnouncement', () => {
  beforeEach(() => {
    mockedPostTweet.mockClear();
    mockedQuoteTweet.mockClear();
  });

  it('tweetId がある場合は引用RTを行い、テンプレートの {invite_url} を置換する', async () => {
    const result = await postQuoteAnnouncement('https://vrchat.com/i/abcdef', 'source-tweet-id', true);

    expect(mockedQuoteTweet).toHaveBeenCalledTimes(1);
    expect(mockedPostTweet).not.toHaveBeenCalled();

    const [text, quoteTweetId, isProd] = mockedQuoteTweet.mock.calls[0]!;
    expect(text).toContain('https://vrchat.com/i/abcdef');
    expect(text).not.toContain('{invite_url}');
    expect(quoteTweetId).toBe('source-tweet-id');
    expect(isProd).toBe(true);
    expect(result).toBe('quoted-id');
  });

  it('tweetId が null の場合は通常投稿にフォールバックする', async () => {
    const result = await postQuoteAnnouncement('https://vrchat.com/i/abcdef', null, false);

    expect(mockedPostTweet).toHaveBeenCalledTimes(1);
    expect(mockedQuoteTweet).not.toHaveBeenCalled();

    const [text, isProd] = mockedPostTweet.mock.calls[0]!;
    expect(text).toContain('https://vrchat.com/i/abcdef');
    expect(isProd).toBe(false);
    expect(result).toBe('posted-id');
  });
});
