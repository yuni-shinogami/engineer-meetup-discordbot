import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';
import type { LtEntry } from '../types';

const mocks = vi.hoisted(() => ({
  announceLt: vi.fn(),
  fetchLtThread: vi.fn(),
  isProdLtThread: vi.fn(() => true),
  applyLtEntryToPost: vi.fn().mockResolvedValue(undefined),
  config: {
    meetupWeekday: 5,
    ltDateCandidates: 8,
    ltAutoAnnounce: true,
  },
}));

vi.mock('../../config', () => ({ config: mocks.config }));

vi.mock('../announce', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../announce')>()),
  announceLt: mocks.announceLt,
}));

vi.mock('../forum', () => ({
  fetchLtThread: mocks.fetchLtThread,
  isProdLtThread: mocks.isProdLtThread,
  applyLtEntryToPost: mocks.applyLtEntryToPost,
}));

vi.mock('../store', () => ({
  ltStore: {
    entriesOnDate: vi.fn(() => [] as LtEntry[]),
    slotUsageByDate: vi.fn(() => new Map<string, number>()),
  },
}));

import { ANNOUNCE_TARGETS } from '../announce';
import { ltStore } from '../store';
import {
  announceLtsForMeetup,
  formatWeeklyLtReport,
  ltEntriesForMeetup,
  nextMeetupDate,
  runWeeklyLtAnnounce,
} from '../weekly-announce';

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

const client = {} as Client;

/** 木曜（前日告知を流す曜日）。翌日の 2026-09-04(金) が対象になる。 */
const THURSDAY = new Date(2026, 8, 3);

function posted(e: LtEntry) {
  return {
    entry: e,
    outcomes: [
      { target: 'x', status: 'posted', ref: 'tweet-1', message: '✅ X: tweet-1' },
      { target: 'discord', status: 'posted', ref: 'url', message: '✅ Discord: url' },
      { target: 'vrchat', status: 'posted', ref: 'vrc-1', message: '✅ VRChatグループ: vrc-1' },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.ltAutoAnnounce = true;
  mocks.isProdLtThread.mockReturnValue(true);
  mocks.fetchLtThread.mockResolvedValue({ id: 't1', parentId: 'prod-forum' });
  mocks.announceLt.mockImplementation(async (_c: Client, e: LtEntry) => posted(e));
  vi.mocked(ltStore.entriesOnDate).mockReturnValue([]);
});

describe('nextMeetupDate', () => {
  it('木曜に実行すると翌日の開催日を返す', () => {
    expect(nextMeetupDate(THURSDAY)).toBe('2026-09-04');
  });
});

describe('ltEntriesForMeetup', () => {
  it('登壇済みは対象外にし、応募順に並べる', () => {
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([
      entry({ id: 'b', createdAt: '2026-08-12T00:00:00.000Z' }),
      entry({ id: 'done', status: 'done' }),
      entry({ id: 'a', createdAt: '2026-08-10T00:00:00.000Z' }),
    ]);

    expect(ltEntriesForMeetup('2026-09-04').map(e => e.id)).toEqual(['a', 'b']);
  });

  it('開催日が空なら何も返さない', () => {
    expect(ltEntriesForMeetup('')).toEqual([]);
  });
});

describe('announceLtsForMeetup', () => {
  it('翌日に確定している登壇を告知し、ポストの表示も更新する', async () => {
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry()]);

    const result = await announceLtsForMeetup(client, true, { now: THURSDAY });

    expect(ltStore.entriesOnDate).toHaveBeenCalledWith('2026-09-04');
    expect(mocks.announceLt).toHaveBeenCalledWith(
      client, expect.objectContaining({ id: 't1' }), true, ANNOUNCE_TARGETS,
    );
    expect(mocks.applyLtEntryToPost).toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ status: 'announced' });
  });

  it('LT の予定が無ければ何も投稿しない', async () => {
    const result = await announceLtsForMeetup(client, true, { now: THURSDAY });

    expect(mocks.announceLt).not.toHaveBeenCalled();
    expect(result.results).toEqual([]);
  });

  it('タイトル未定なら投稿せず、足りないものを残す', async () => {
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry({ title: '未定' })]);

    const result = await announceLtsForMeetup(client, true, { now: THURSDAY });

    expect(mocks.announceLt).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ status: 'blocked' });
    expect(result.results[0]!.missing.join()).toContain('タイトル');
  });

  // ref は 1 組しか持たないので、テスト実行が本番分を「投稿済み」にすると木曜の投稿が飛ぶ
  it('テスト実行では本番フォーラムの応募に触らない', async () => {
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry()]);
    mocks.isProdLtThread.mockReturnValue(true);

    const result = await announceLtsForMeetup(client, false, { now: THURSDAY });

    expect(mocks.announceLt).not.toHaveBeenCalled();
    // 黙って消すと「対象ゼロ」と見分けが付かないので、対象外だったことは残す
    expect(result.results[0]).toMatchObject({ status: 'other-forum' });
  });

  it('本番実行ではテストフォーラムの応募に触らない', async () => {
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry()]);
    mocks.isProdLtThread.mockReturnValue(false);

    await announceLtsForMeetup(client, true, { now: THURSDAY });

    expect(mocks.announceLt).not.toHaveBeenCalled();
  });

  it('ポストを取得できない応募は運営に回し、他の登壇は止めない', async () => {
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([
      entry({ id: 'gone', createdAt: '2026-08-10T00:00:00.000Z' }),
      entry({ id: 'ok', createdAt: '2026-08-11T00:00:00.000Z' }),
    ]);
    mocks.fetchLtThread.mockRejectedValueOnce(new Error('Unknown Channel'));

    const result = await announceLtsForMeetup(client, true, { now: THURSDAY });

    expect(result.results[0]).toMatchObject({ entry: { id: 'gone' }, status: 'unreachable' });
    expect(result.results[1]).toMatchObject({ entry: { id: 'ok' }, status: 'announced' });
  });
});

describe('formatWeeklyLtReport', () => {
  it('予定が無ければ通知しない', () => {
    expect(formatWeeklyLtReport({ eventDate: '2026-09-04', results: [] })).toBeNull();
  });

  it('媒体ごとの結果と応募ポストへのリンクを出す', async () => {
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry()]);

    const report = formatWeeklyLtReport(await announceLtsForMeetup(client, true, { now: THURSDAY }));

    expect(report).toContain('9月4日(金)');
    expect(report).toContain('<#t1>');
    expect(report).toContain('✅ X: tweet-1');
    expect(report).not.toContain('告知する」ボタン');
  });

  it('フォーラム違いでスキップした応募も理由付きで挙げる', async () => {
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry()]);
    mocks.isProdLtThread.mockReturnValue(false);

    const report = formatWeeklyLtReport(await announceLtsForMeetup(client, true, { now: THURSDAY }));

    expect(report).toContain('違うフォーラムの応募なので対象外');
    // 仕分けが効いているだけなので、手当てを促す文言は付けない
    expect(report).not.toContain('告知する」ボタン');
  });

  it('見送りや失敗があれば出し直し方を添える', async () => {
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry({ title: '未定' })]);

    const report = formatWeeklyLtReport(await announceLtsForMeetup(client, true, { now: THURSDAY }));

    expect(report).toContain('告知を見送りました');
    expect(report).toContain('告知する」ボタン');
  });
});

describe('runWeeklyLtAnnounce', () => {
  it('設定で無効にしていれば投稿しない', async () => {
    mocks.config.ltAutoAnnounce = false;
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry()]);

    expect(await runWeeklyLtAnnounce(client, true, { now: THURSDAY })).toBeNull();
    expect(mocks.announceLt).not.toHaveBeenCalled();
  });

  // 設定は「事前告知に同乗させるか」の切り替えなので、名指しの指示のほうが強い
  it('force を渡せば設定で無効でも実行する', async () => {
    mocks.config.ltAutoAnnounce = false;
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry()]);

    expect(await runWeeklyLtAnnounce(client, true, { force: true, now: THURSDAY }))
      .toContain('✅ X: tweet-1');
  });

  // 事前告知そのものを巻き添えにしないため、ここで例外を外に出さない
  it('想定外の失敗も報告文に畳んで返す', async () => {
    vi.mocked(ltStore.entriesOnDate).mockImplementation(() => {
      throw new Error('store broken');
    });

    expect(await runWeeklyLtAnnounce(client, true, { now: THURSDAY })).toContain('store broken');
  });
});
