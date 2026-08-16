import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ButtonInteraction } from 'discord.js';
import type { LtEntry } from '../../lt/types';

const mocks = vi.hoisted(() => ({
  announceLt: vi.fn(),
  threadSend: vi.fn().mockResolvedValue(undefined),
  config: {
    operatorRoleId: 'op-role',
    publicChannelId: 'public-ch',
    testChannelId: 'test-ch',
    vrcStateDir: '/state',
    ltAnnounceRoleId: '',
    ltGroupPostNotify: false,
    ltForumChannelId: 'prod-forum',
  },
}));

vi.mock('../../config', () => ({ config: mocks.config, ltForumChannelId: () => '' }));

vi.mock('../../lt/announce', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lt/announce')>()),
  announceLt: mocks.announceLt,
}));

vi.mock('../../lt/forum', () => ({
  applyLtEntryToPost: vi.fn().mockResolvedValue(undefined),
  fetchLtThread: vi.fn().mockResolvedValue({ id: 't1', parentId: 'prod-forum', send: mocks.threadSend }),
  isProdLtThread: () => true,
}));

vi.mock('../../lt/materials', () => ({
  materialExists: (p: unknown) => typeof p === 'string' && p !== '',
}));

vi.mock('../../lt/store', () => ({
  ltStore: { get: vi.fn(), slotUsageByDate: vi.fn(() => new Map<string, number>()) },
}));

import { ltStore } from '../../lt/store';
import { handleLtAnnounceButton, handleLtAnnounceConfirm } from '../lt-announce';

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

function buttonInteraction(roles: string[] = ['op-role']) {
  return {
    user: { id: 'operator' },
    member: { roles },
    client: {},
    reply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ButtonInteraction & {
    reply: ReturnType<typeof vi.fn>;
    editReply: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ltStore.get).mockReturnValue(entry());
  mocks.announceLt.mockResolvedValue({
    entry: entry({ status: 'announced' }),
    outcomes: [
      { target: 'x', status: 'posted', ref: 'tweet-1', message: '✅ X: tweet-1' },
      { target: 'discord', status: 'posted', ref: 'url', message: '✅ Discord: url' },
      { target: 'vrchat', status: 'posted', ref: 'vrc-1', message: '✅ VRChatグループ: vrc-1' },
    ],
  });
});

describe('handleLtAnnounceButton', () => {
  // 告知は取り消せないので、ボタン1回では絶対に投稿させない
  it('押しただけでは投稿せず、実際の文面を確認させる', async () => {
    const interaction = buttonInteraction();
    await handleLtAnnounceButton(interaction, ['t1']);

    expect(mocks.announceLt).not.toHaveBeenCalled();

    const payload = interaction.reply.mock.calls[0]![0];
    expect(payload.ephemeral).toBe(true);
    expect(payload.content).toContain('型で殴るLT');
    expect(payload.content).toContain('本番');
    expect(payload.components).toHaveLength(1);
  });

  it('開催日やタイトルが足りなければプレビューも出さない', async () => {
    vi.mocked(ltStore.get).mockReturnValue(entry({ title: '未定' }));
    const interaction = buttonInteraction();

    await handleLtAnnounceButton(interaction, ['t1']);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('LT のタイトル') }),
    );
    expect(interaction.reply.mock.calls[0]![0].components).toBeUndefined();
  });

  it('告知画像が無ければプレビューで警告する', async () => {
    vi.mocked(ltStore.get).mockReturnValue(entry({
      materials: { speakerIconPath: null, titleSlidePath: null, announceImagePath: null },
    }));
    const interaction = buttonInteraction();

    await handleLtAnnounceButton(interaction, ['t1']);

    expect(interaction.reply.mock.calls[0]![0].content).toContain('告知画像がまだありません');
  });

  it('投稿済みの媒体はプレビューでスキップと分かる', async () => {
    const posted = entry();
    posted.announce.x = { ref: 'tweet-old', postedAt: 'now' };
    vi.mocked(ltStore.get).mockReturnValue(posted);

    const interaction = buttonInteraction();
    await handleLtAnnounceButton(interaction, ['t1']);

    expect(interaction.reply.mock.calls[0]![0].content).toContain('投稿済みのためスキップ');
  });

  it('運営でなければプレビューも出さない', async () => {
    const interaction = buttonInteraction([]);
    await handleLtAnnounceButton(interaction, ['t1']);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('運営のみ') }),
    );
  });
});

describe('handleLtAnnounceConfirm', () => {
  it('確認して初めて投稿し、結果を媒体ごとに返す', async () => {
    const interaction = buttonInteraction();
    await handleLtAnnounceConfirm(interaction, ['t1']);

    expect(mocks.announceLt).toHaveBeenCalledWith(interaction.client, expect.objectContaining({ id: 't1' }), true);

    const payload = interaction.editReply.mock.calls[0]![0];
    expect(payload.content).toContain('✅ X: tweet-1');
    expect(payload.content).toContain('投稿しました');
    expect(payload.components).toEqual([]);
    expect(mocks.threadSend).toHaveBeenCalled();
  });

  it('一部失敗なら再実行を促し、登壇者には通知しない', async () => {
    mocks.announceLt.mockResolvedValue({
      entry: entry({ status: 'announced' }),
      outcomes: [
        { target: 'x', status: 'failed', ref: null, message: '❌ X: 失敗 — rate limited' },
        { target: 'discord', status: 'posted', ref: 'url', message: '✅ Discord: url' },
        { target: 'vrchat', status: 'posted', ref: 'vrc-1', message: '✅ VRChatグループ: vrc-1' },
      ],
    });

    const interaction = buttonInteraction();
    await handleLtAnnounceConfirm(interaction, ['t1']);

    const payload = interaction.editReply.mock.calls[0]![0];
    expect(payload.content).toContain('一部の媒体で失敗');
    expect(payload.content).toContain('rate limited');
    // 告知しきれていない段階で「告知しました」と伝えない
    expect(mocks.threadSend).not.toHaveBeenCalled();
  });

  it('運営でなければ投稿しない', async () => {
    await handleLtAnnounceConfirm(buttonInteraction([]), ['t1']);

    expect(mocks.announceLt).not.toHaveBeenCalled();
  });
});
