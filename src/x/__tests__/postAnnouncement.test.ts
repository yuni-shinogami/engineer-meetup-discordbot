import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// getNextFridayDate はサーバーのローカルタイムゾーンに依存するため、
// 実行環境によらず結果が安定するよう明示的に JST に固定する。
process.env.TZ = 'Asia/Tokyo';

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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('直近の金曜日の日付を YYYY/MM/DD 形式で本文に埋め込む', async () => {
    // 2026/07/13 は月曜日 -> 直近の金曜日は 2026/07/17
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00+09:00'));

    await postAnnouncement(true);

    expect(mockedPostTweetWithImage).toHaveBeenCalledTimes(1);
    const [text] = mockedPostTweetWithImage.mock.calls[0]!;
    expect(text).toContain('2026/07/17');
    expect(text).not.toContain('{date}');
  });

  it('当日が金曜日の場合はその日の日付を使う', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T00:00:00+09:00'));

    await postAnnouncement(true);

    const [text] = mockedPostTweetWithImage.mock.calls[0]!;
    expect(text).toContain('2026/07/17');
  });

  it('isProd フラグをそのまま渡す', async () => {
    await postAnnouncement(false);

    const [, , isProd] = mockedPostTweetWithImage.mock.calls[0]!;
    expect(isProd).toBe(false);
  });

  it('画像投稿の結果 (tweetId) をそのまま返す', async () => {
    const result = await postAnnouncement(true);
    expect(result).toBe('tweet-id-123');
  });
});
