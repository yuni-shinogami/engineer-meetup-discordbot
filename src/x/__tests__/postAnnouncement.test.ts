import { describe, it, expect, vi, beforeEach } from 'vitest';

import { postAnnouncement } from '../postAnnouncement';
import { postTweetWithImage } from '../xBot';

vi.mock('../xBot', () => ({
  postTweetWithImage: vi.fn().mockResolvedValue('tweet-id-123'),
}));

const mockedPostTweetWithImage = vi.mocked(postTweetWithImage);

describe('postAnnouncement', () => {
  beforeEach(() => {
    mockedPostTweetWithImage.mockClear();
  });

  it('受け取った開催日を本文に埋め込む', async () => {
    await postAnnouncement('2026/07/17', true);

    expect(mockedPostTweetWithImage).toHaveBeenCalledTimes(1);
    const [text] = mockedPostTweetWithImage.mock.calls[0]!;
    expect(text).toContain('2026/07/17');
    expect(text).not.toContain('{date}');
  });

  it('isProd フラグをそのまま渡す', async () => {
    await postAnnouncement('2026/07/17', false);

    const [, , isProd] = mockedPostTweetWithImage.mock.calls[0]!;
    expect(isProd).toBe(false);
  });

  it('画像投稿の結果 (tweetId) をそのまま返す', async () => {
    const result = await postAnnouncement('2026/07/17', true);
    expect(result).toBe('tweet-id-123');
  });
});
