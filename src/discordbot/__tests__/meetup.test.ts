import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../x/postAnnouncement', () => ({
  postAnnouncement: vi.fn().mockResolvedValue('tweet-id-123'),
}));

vi.mock('../config', () => ({
  config: {
    xAccount: 'MainAccount',
    testXAccount: 'TestAccount',
  },
}));

vi.mock('../storage', () => ({
  storage: {
    lastTweetId: null as string | null,
    preAnnouncePostUrl: null as string | null,
  },
}));

import { sendConfirmMeetupToChannel, executePreAnnounce } from '../meetup';
import { postAnnouncement } from '../../x/postAnnouncement';
import { config } from '../config';
import { storage } from '../storage';
import type { Client } from 'discord.js';

const mockedPostAnnouncement = vi.mocked(postAnnouncement);

function makeClient(channel: unknown) {
  const fetch = vi.fn().mockResolvedValue(channel);
  return { client: { channels: { fetch } } as unknown as Client, fetch };
}

describe('sendConfirmMeetupToChannel', () => {
  it('YES/NOボタン付きメッセージをチャンネルに送信する', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { client, fetch } = makeClient({ send });

    await sendConfirmMeetupToChannel(client, 'channel-id');

    expect(fetch).toHaveBeenCalledWith('channel-id');
    expect(send).toHaveBeenCalledTimes(1);
    const [payload] = send.mock.calls[0]!;
    expect(payload.content).toContain('今週エンジニア集会やる？');
    expect(payload.components).toHaveLength(1);
  });

  it('チャンネルが見つからない場合はエラーを投げる', async () => {
    const { client } = makeClient(null);
    await expect(sendConfirmMeetupToChannel(client, 'channel-id')).rejects.toThrow('チャンネルが見つかりません');
  });
});

describe('executePreAnnounce', () => {
  beforeEach(() => {
    mockedPostAnnouncement.mockClear();
    storage.lastTweetId = null;
    storage.preAnnouncePostUrl = null;
  });

  it('本番アカウントのツイートURLを組み立てて storage に保存する', async () => {
    const url = await executePreAnnounce(true);

    expect(mockedPostAnnouncement).toHaveBeenCalledWith(true);
    expect(url).toBe('https://x.com/MainAccount/status/tweet-id-123');
    expect(storage.lastTweetId).toBe('tweet-id-123');
    expect(storage.preAnnouncePostUrl).toBe('https://x.com/MainAccount/status/tweet-id-123');
  });

  it('テストアカウントのツイートURLを組み立てる', async () => {
    const url = await executePreAnnounce(false);

    expect(mockedPostAnnouncement).toHaveBeenCalledWith(false);
    expect(url).toBe('https://x.com/TestAccount/status/tweet-id-123');
  });

  it('xAccount が未設定の場合は tweetId をそのまま URL 扱いにする', async () => {
    const original = config.xAccount;
    config.xAccount = '';
    try {
      const url = await executePreAnnounce(true);
      expect(url).toBe('tweet-id-123');
    } finally {
      config.xAccount = original;
    }
  });
});
