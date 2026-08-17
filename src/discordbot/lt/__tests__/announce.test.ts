import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';
import type { LtEntry } from '../types';

const mocks = vi.hoisted(() => ({
  postTweet: vi.fn(async () => 'tweet-1'),
  postTweetWithImage: vi.fn(async () => 'tweet-img-1'),
  postLtGroupAnnouncement: vi.fn(async () => 'vrc-post-1'),
  channelSend: vi.fn(async (_payload: { content: string }) => ({ url: 'https://discord.com/channels/1/2/3' })),
  config: {
    publicChannelId: 'public-ch',
    testChannelId: 'test-ch',
    vrcStateDir: '/state',
    ltAnnounceRoleId: '',
    ltGroupPostNotify: false,
    xAccount: 'prod-account',
    testXAccount: 'test-account',
  },
}));

vi.mock('../../config', () => ({
  config: mocks.config,
  ltAnnounceRoleId: () => mocks.config.ltAnnounceRoleId,
}));
vi.mock('../../../x/xBot', () => ({
  postTweet: mocks.postTweet,
  postTweetWithImage: mocks.postTweetWithImage,
}));
vi.mock('../../../vrchat/postLtAnnouncement', () => ({
  postLtGroupAnnouncement: mocks.postLtGroupAnnouncement,
}));
vi.mock('../materials', () => ({
  materialExists: (p: unknown) => typeof p === 'string' && p !== '',
}));
vi.mock('../store', () => ({
  ltStore: { update: vi.fn((id: string, patch: object) => ({ ...entry({ id }), ...patch })) },
}));

import { ltStore } from '../store';
import {
  MEETUP_DAY_TARGETS,
  PRE_ANNOUNCE_TARGETS,
  announceLt,
  announceSummary,
  missingForAnnounce,
} from '../announce';

const entry = (patch: Partial<LtEntry> = {}): LtEntry => ({
  id: 't1',
  speakerId: 'speaker',
  speakerName: 'ゆに',
  title: '型で殴るLT',
  xAccount: 'yuni',
  durationMin: 10,
  videoPlayback: true,
  capturePolicy: 'allowed',
  archivePolicy: 'public',
  status: 'ready',
  preferredDates: [],
  scheduleNote: '',
  eventDate: '2026-09-04',
  materials: {
    speakerIconPath: '/m/icon.png',
    titleSlidePath: '/m/slide.png',
    announceImagePath: '/m/announce.png',
  },
  announce: {
    x: { ref: null, postedAt: null },
    discord: { ref: null, postedAt: null },
    vrchat: { ref: null, postedAt: null },
  },
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  ...patch,
});

const client = {
  channels: { fetch: vi.fn(async () => ({ send: mocks.channelSend })) },
} as unknown as Client;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.postTweet.mockResolvedValue('tweet-1');
  mocks.postTweetWithImage.mockResolvedValue('tweet-img-1');
  mocks.postLtGroupAnnouncement.mockResolvedValue('vrc-post-1');
  mocks.channelSend.mockResolvedValue({ url: 'https://discord.com/channels/1/2/3' });
  mocks.config.publicChannelId = 'public-ch';
  mocks.config.vrcStateDir = '/state';
  vi.mocked(ltStore.update).mockImplementation((id, patch) => ({ ...entry({ id }), ...patch }));
});

describe('missingForAnnounce', () => {
  it('開催日とタイトルがそろっていれば告知できる', () => {
    expect(missingForAnnounce(entry())).toEqual([]);
  });

  it('画像が無くても告知自体は止めない', () => {
    expect(missingForAnnounce(entry({
      materials: { speakerIconPath: null, titleSlidePath: null, announceImagePath: null },
    }))).toEqual([]);
  });

  it('開催日未確定・タイトル未定は挙げる', () => {
    expect(missingForAnnounce(entry({ eventDate: null })).join()).toContain('開催日');
    expect(missingForAnnounce(entry({ title: '未定' })).join()).toContain('タイトル');
  });
});

describe('announceLt', () => {
  it('3媒体すべてに投稿し、参照を記録して告知済みにする', async () => {
    const { entry: updated, outcomes } = await announceLt(client, entry(), true);

    expect(mocks.postTweetWithImage).toHaveBeenCalledWith(expect.any(String), '/m/announce.png', true);
    expect(mocks.channelSend).toHaveBeenCalled();
    expect(mocks.postLtGroupAnnouncement).toHaveBeenCalled();

    expect(outcomes.every(o => o.status === 'posted')).toBe(true);
    expect(updated.status).toBe('announced');
    expect(ltStore.update).toHaveBeenCalledWith('t1', expect.objectContaining({
      announce: expect.objectContaining({
        x: { ref: 'tweet-img-1', postedAt: expect.any(String) },
        discord: { ref: 'https://discord.com/channels/1/2/3', postedAt: expect.any(String) },
        vrchat: { ref: 'vrc-post-1', postedAt: expect.any(String) },
      }),
    }));
  });

  it('告知画像が無ければ画像なしで投稿する', async () => {
    await announceLt(client, entry({
      materials: { speakerIconPath: null, titleSlidePath: null, announceImagePath: null },
    }), true);

    expect(mocks.postTweet).toHaveBeenCalled();
    expect(mocks.postTweetWithImage).not.toHaveBeenCalled();
  });

  // 告知は取り消せないので、再実行で二重投稿しないことが最優先
  it('投稿済みの媒体は再投稿しない', async () => {
    const posted = entry();
    posted.announce.x = { ref: 'tweet-old', postedAt: '2026-08-14T00:00:00.000Z' };

    const { outcomes } = await announceLt(client, posted, true);

    expect(mocks.postTweetWithImage).not.toHaveBeenCalled();
    expect(outcomes.find(o => o.target === 'x')).toMatchObject({ status: 'skipped', ref: 'tweet-old' });
    expect(mocks.channelSend).toHaveBeenCalled();
  });

  it('投稿済みの参照は上書きしない', async () => {
    const posted = entry();
    posted.announce.x = { ref: 'tweet-old', postedAt: '2026-08-14T00:00:00.000Z' };

    await announceLt(client, posted, true);

    expect(ltStore.update).toHaveBeenCalledWith('t1', expect.objectContaining({
      announce: expect.objectContaining({
        x: { ref: 'tweet-old', postedAt: '2026-08-14T00:00:00.000Z' },
      }),
    }));
  });

  it('1媒体が失敗しても他は投稿し、失敗分は記録しない', async () => {
    mocks.postTweetWithImage.mockRejectedValue(new Error('X rate limited'));

    const { entry: updated, outcomes } = await announceLt(client, entry(), true);

    expect(outcomes.find(o => o.target === 'x')).toMatchObject({ status: 'failed' });
    expect(outcomes.find(o => o.target === 'x')!.message).toContain('X rate limited');
    expect(updated.announce.x.ref).toBeNull();
    expect(mocks.postLtGroupAnnouncement).toHaveBeenCalled();
    // どれか出ていれば告知済みには進める
    expect(updated.status).toBe('announced');
  });

  it('すべて失敗したらステータスを進めない', async () => {
    mocks.postTweetWithImage.mockRejectedValue(new Error('x failed'));
    mocks.channelSend.mockRejectedValue(new Error('discord failed'));
    mocks.postLtGroupAnnouncement.mockRejectedValue(new Error('vrc failed'));

    const { entry: updated, outcomes } = await announceLt(client, entry(), true);

    expect(outcomes.every(o => o.status === 'failed')).toBe(true);
    expect(updated.status).toBe('ready');
  });

  it('未設定の媒体はスキップとして扱い、失敗にはしない', async () => {
    mocks.config.publicChannelId = '';
    mocks.config.vrcStateDir = '';

    const { outcomes } = await announceLt(client, entry(), true);

    expect(outcomes.find(o => o.target === 'discord')).toMatchObject({ status: 'skipped' });
    expect(outcomes.find(o => o.target === 'vrchat')).toMatchObject({ status: 'skipped' });
    expect(outcomes.find(o => o.target === 'x')).toMatchObject({ status: 'posted' });
  });

  // X は前日告知、Discord と VRChat は当日の開催告知に乗せるので、呼び出し側が媒体を絞る
  it('targets で指定した媒体だけに投稿する', async () => {
    const { outcomes } = await announceLt(client, entry(), true, MEETUP_DAY_TARGETS);

    expect(mocks.channelSend).toHaveBeenCalled();
    expect(mocks.postLtGroupAnnouncement).toHaveBeenCalled();
    expect(mocks.postTweetWithImage).not.toHaveBeenCalled();
    expect(outcomes.map(o => o.target)).toEqual(['discord', 'vrchat']);
  });

  it('前日告知では X だけに投稿する', async () => {
    const { outcomes } = await announceLt(client, entry(), true, PRE_ANNOUNCE_TARGETS);

    expect(mocks.postTweetWithImage).toHaveBeenCalled();
    expect(mocks.channelSend).not.toHaveBeenCalled();
    expect(mocks.postLtGroupAnnouncement).not.toHaveBeenCalled();
    expect(outcomes.map(o => o.target)).toEqual(['x']);
  });

  it('X の告知が済んでいれば Discord 本文にその URL を載せる', async () => {
    const posted = entry();
    posted.announce.x = { ref: '2060342403836649944', postedAt: 'now' };

    await announceLt(client, posted, true, ['discord']);

    expect(mocks.channelSend.mock.calls[0]![0].content)
      .toContain('https://x.com/prod-account/status/2060342403836649944');
  });

  it('X が未投稿なら Discord 本文に URL を入れない', async () => {
    await announceLt(client, entry(), true, ['discord']);

    expect(mocks.channelSend.mock.calls[0]![0].content).not.toContain('https://x.com/');
  });

  it('テストモードではテストチャンネルへ投稿する', async () => {
    await announceLt(client, entry(), false);

    expect(client.channels.fetch).toHaveBeenCalledWith('test-ch');
    expect(mocks.postLtGroupAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ isProd: false }),
    );
  });

  it('グループ通知の既定は飛ばさない', async () => {
    await announceLt(client, entry(), true);

    expect(mocks.postLtGroupAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ sendNotification: false }),
    );
  });
});

describe('announceSummary', () => {
  it('投稿できた媒体が一目で分かる', () => {
    const announce = entry().announce;
    announce.discord = { ref: 'https://discord.com/x', postedAt: 'now' };

    const summary = announceSummary(announce);
    expect(summary).toContain('❌ X');
    expect(summary).toContain('✅ Discord');
    expect(summary).toContain('❌ VRChatグループ');
  });
});
