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

import { triggerConfirmMeetup, triggerPreAnnounce } from '../scheduler';
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
  beforeEach(() => {
    mockedExecutePreAnnounce.mockReset();
    storage.isScheduled = true;
  });

  it('今週開催予定でない場合は何もせずスキップする', async () => {
    storage.isScheduled = false;
    const { client, fetch } = makeClient();

    await triggerPreAnnounce(client, true);

    expect(mockedExecutePreAnnounce).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
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
