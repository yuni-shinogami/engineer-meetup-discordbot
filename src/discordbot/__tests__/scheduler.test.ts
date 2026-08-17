import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../meetup', () => ({
  sendConfirmMeetupToChannel: vi.fn().mockResolvedValue(undefined),
  executePreAnnounce: vi.fn(),
}));

vi.mock('../config', () => ({
  config: {
    operationsChannelId: 'ops-channel-id',
    testChannelId: 'test-channel-id',
  },
}));

vi.mock('../storage', () => ({
  storage: {
    isScheduled: true,
  },
}));

vi.mock('../lt/weekly-announce', () => ({
  runWeeklyLtAnnounce: vi.fn().mockResolvedValue(null),
}));

import { triggerConfirmMeetup, triggerPreAnnounce } from '../scheduler';
import { runWeeklyLtAnnounce } from '../lt/weekly-announce';
import { PRE_ANNOUNCE_TARGETS } from '../lt/announce';
import { sendConfirmMeetupToChannel, executePreAnnounce } from '../meetup';
import { storage } from '../storage';
import type { Client } from 'discord.js';

const mockedSendConfirm = vi.mocked(sendConfirmMeetupToChannel);
const mockedExecutePreAnnounce = vi.mocked(executePreAnnounce);

function makeClient(send = vi.fn().mockResolvedValue(undefined)) {
  const channel = { send };
  const fetch = vi.fn().mockResolvedValue(channel);
  return { client: { channels: { fetch } } as unknown as Client, fetch, send };
}

describe('triggerConfirmMeetup', () => {
  beforeEach(() => {
    mockedSendConfirm.mockClear();
  });

  it('isProd: true の場合は運営チャンネルへ送る', async () => {
    const { client } = makeClient();
    await triggerConfirmMeetup(client, true);
    expect(mockedSendConfirm).toHaveBeenCalledWith(client, 'ops-channel-id');
  });

  it('isProd: false の場合はテストチャンネルへ送る', async () => {
    const { client } = makeClient();
    await triggerConfirmMeetup(client, false);
    expect(mockedSendConfirm).toHaveBeenCalledWith(client, 'test-channel-id');
  });
});

describe('triggerPreAnnounce', () => {
  const mockedRunWeeklyLt = vi.mocked(runWeeklyLtAnnounce);

  beforeEach(() => {
    mockedExecutePreAnnounce.mockReset();
    mockedRunWeeklyLt.mockReset();
    mockedRunWeeklyLt.mockResolvedValue(null);
    storage.isScheduled = true;
  });

  it('今週開催予定でない場合は何もせずスキップする', async () => {
    storage.isScheduled = false;
    const { client, fetch } = makeClient();

    await triggerPreAnnounce(client, true);

    expect(mockedExecutePreAnnounce).not.toHaveBeenCalled();
    expect(mockedRunWeeklyLt).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  // 普段の運用どおり、前日告知と同じタイミングで LT のお知らせも出す
  it('事前告知に続けて翌日の LT 告知も投稿し、結果を運営チャンネルに流す', async () => {
    mockedExecutePreAnnounce.mockResolvedValue('https://x.com/foo/status/1');
    mockedRunWeeklyLt.mockResolvedValue('📣 9月4日(金) の LT 告知\n✅ X: tweet-1');
    const { client, send } = makeClient();

    await triggerPreAnnounce(client, true);

    expect(mockedRunWeeklyLt).toHaveBeenCalledWith(client, true, { targets: PRE_ANNOUNCE_TARGETS });
    expect(send).toHaveBeenLastCalledWith(expect.stringContaining('✅ X: tweet-1'));
  });

  it('LT の予定が無ければ運営チャンネルに余計な通知を出さない', async () => {
    mockedExecutePreAnnounce.mockResolvedValue('https://x.com/foo/status/1');
    const { client, send } = makeClient();

    await triggerPreAnnounce(client, true);

    expect(send).toHaveBeenCalledTimes(1);
  });

  // LT 告知は事前告知とは独立した投稿なので、片方の失敗で巻き添えにしない
  it('事前告知が失敗しても LT 告知は実行する', async () => {
    mockedExecutePreAnnounce.mockRejectedValue(new Error('X API error'));
    const { client } = makeClient();

    await triggerPreAnnounce(client, true);

    expect(mockedRunWeeklyLt).toHaveBeenCalled();
  });

  it('成功時は事前告知URLを添えて運営チャンネルに通知する', async () => {
    mockedExecutePreAnnounce.mockResolvedValue('https://x.com/foo/status/1');
    const { client, fetch, send } = makeClient();

    await triggerPreAnnounce(client, true);

    expect(mockedExecutePreAnnounce).toHaveBeenCalledWith(true);
    expect(fetch).toHaveBeenCalledWith('ops-channel-id');
    expect(send).toHaveBeenCalledWith('事前告知ツイートを投稿しました。\nhttps://x.com/foo/status/1');
  });

  it('isProd: false の場合はテストチャンネルに通知する', async () => {
    mockedExecutePreAnnounce.mockResolvedValue('https://x.com/foo/status/1');
    const { client, fetch } = makeClient();

    await triggerPreAnnounce(client, false);

    expect(fetch).toHaveBeenCalledWith('test-channel-id');
  });

  it('事前告知の投稿に失敗した場合はエラーメッセージを通知し、例外は投げない', async () => {
    mockedExecutePreAnnounce.mockRejectedValue(new Error('X API error'));
    const { client, send } = makeClient();

    await expect(triggerPreAnnounce(client, true)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith('【エラー】事前告知ツイートの投稿に失敗しました。');
  });
});
