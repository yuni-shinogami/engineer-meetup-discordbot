import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { LtEntry } from '../../lt/types';

const mocks = vi.hoisted(() => ({
  threadSend: vi.fn().mockResolvedValue(undefined),
  saveMaterialFromUrl: vi.fn(async (id: string, kind: string) => `/materials/${id}/${kind}.png`),
  fetchXProfileImageUrl: vi.fn(async (): Promise<string | null> => 'https://pbs.twimg.com/a_400x400.jpg'),
  buildAnnounceImage: vi.fn(),
  missingForAnnounceImage: vi.fn(() => [] as string[]),
}));

vi.mock('../../config', () => ({
  config: { operatorRoleId: 'op-role', ltForumChannelId: 'prod-forum' },
  ltForumChannelId: () => '',
}));

vi.mock('../../lt/forum', () => ({
  applyLtEntryToPost: vi.fn().mockResolvedValue(undefined),
  fetchLtThread: vi.fn().mockResolvedValue({ id: 't1', parentId: 'prod-forum', send: mocks.threadSend }),
  isProdLtThread: () => true,
}));

vi.mock('../../lt/materials', () => ({
  MaterialError: class MaterialError extends Error {},
  materialExists: (p: unknown) => typeof p === 'string' && p !== '',
  saveMaterialFromUrl: mocks.saveMaterialFromUrl,
}));

vi.mock('../../lt/announce-image', () => ({
  buildAnnounceImage: mocks.buildAnnounceImage,
  missingForAnnounceImage: mocks.missingForAnnounceImage,
}));

vi.mock('../../../x/profileImage', () => ({ fetchXProfileImageUrl: mocks.fetchXProfileImageUrl }));

vi.mock('../../lt/store', () => ({
  ltStore: {
    get: vi.fn(),
    update: vi.fn(),
    findBySpeaker: vi.fn(() => [] as LtEntry[]),
    slotUsageByDate: vi.fn(() => new Map<string, number>()),
  },
}));

import { ltStore } from '../../lt/store';
import { handleLtMaterialCommand } from '../lt-material';

const entry = (patch: Partial<LtEntry> = {}): LtEntry => ({
  id: 't1',
  speakerId: 'speaker',
  speakerName: 'ゆに',
  title: '型で殴る話',
  xAccount: 'yuni',
  durationMin: 10,
  videoPlayback: true,
  capturePolicy: 'allowed',
  archivePolicy: 'public',
  status: 'scheduled',
  preferredDates: [],
  scheduleNote: '',
  eventDate: '2026-09-04',
  materials: { speakerIconPath: null, titleSlidePath: null, announceImagePath: null },
  announce: {
    x: { ref: null, postedAt: null },
    discord: { ref: null, postedAt: null },
    vrchat: { ref: null, postedAt: null },
  },
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  ...patch,
});

function interactionFor(
  attachments: Record<string, { url: string } | null> = {},
  { inThread = true, userId = 'speaker' } = {},
) {
  return {
    channelId: 't1',
    channel: { isThread: () => inThread },
    user: { id: userId },
    member: { roles: [] },
    client: {},
    options: { getAttachment: (name: string) => attachments[name] ?? null },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & {
    editReply: ReturnType<typeof vi.fn>;
    reply: ReturnType<typeof vi.fn>;
  };
}

describe('handleLtMaterialCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ltStore.get).mockReturnValue(entry());
    vi.mocked(ltStore.findBySpeaker).mockReturnValue([]);
    vi.mocked(ltStore.update).mockImplementation((id, patch) => ({ ...entry({ id }), ...patch }));
    mocks.saveMaterialFromUrl.mockImplementation(async (id, kind) => `/materials/${id}/${kind}.png`);
    mocks.fetchXProfileImageUrl.mockResolvedValue('https://pbs.twimg.com/a_400x400.jpg');
    mocks.missingForAnnounceImage.mockReturnValue([]);
    mocks.buildAnnounceImage.mockImplementation(async (e: LtEntry) => ({
      ...e,
      status: 'ready',
      materials: { ...e.materials, announceImagePath: '/materials/t1/announceImage.png' },
    }));
  });

  it('添付された素材を保存してレコードに反映する', async () => {
    const interaction = interactionFor({
      'title-slide': { url: 'https://cdn.discordapp.com/slide.png' },
      icon: { url: 'https://cdn.discordapp.com/icon.png' },
    });

    await handleLtMaterialCommand(interaction);

    expect(mocks.saveMaterialFromUrl).toHaveBeenCalledWith('t1', 'titleSlide', 'https://cdn.discordapp.com/slide.png');
    expect(mocks.saveMaterialFromUrl).toHaveBeenCalledWith('t1', 'speakerIcon', 'https://cdn.discordapp.com/icon.png');
    expect(ltStore.update).toHaveBeenCalledWith('t1', {
      materials: {
        speakerIconPath: '/materials/t1/speakerIcon.png',
        titleSlidePath: '/materials/t1/titleSlide.png',
        announceImagePath: null,
      },
    });
  });

  it('アイコン未添付なら X のプロフィール画像で埋める', async () => {
    await handleLtMaterialCommand(interactionFor({ 'title-slide': { url: 'https://cdn/slide.png' } }));

    expect(mocks.fetchXProfileImageUrl).toHaveBeenCalledWith('yuni', true);
    expect(mocks.saveMaterialFromUrl).toHaveBeenCalledWith(
      't1', 'speakerIcon', 'https://pbs.twimg.com/a_400x400.jpg',
    );
  });

  it('X から取得できなければ添付を促し、処理は止めない', async () => {
    // X API のプランによってはユーザー検索が使えないため、ここで落としてはいけない
    mocks.fetchXProfileImageUrl.mockResolvedValue(null);
    const interaction = interactionFor({ 'title-slide': { url: 'https://cdn/slide.png' } });

    await handleLtMaterialCommand(interaction);

    const message = interaction.editReply.mock.calls[0]![0] as string;
    expect(message).toContain('取得できませんでした');
    expect(ltStore.update).toHaveBeenCalled();
  });

  it('X アカウント未登録なら X には問い合わせない', async () => {
    vi.mocked(ltStore.get).mockReturnValue(entry({ xAccount: null }));

    await handleLtMaterialCommand(interactionFor({ 'title-slide': { url: 'https://cdn/slide.png' } }));

    expect(mocks.fetchXProfileImageUrl).not.toHaveBeenCalled();
  });

  it('既にアイコンがあれば X には問い合わせない', async () => {
    vi.mocked(ltStore.get).mockReturnValue(entry({
      materials: { speakerIconPath: '/materials/t1/speakerIcon.png', titleSlidePath: null, announceImagePath: null },
    }));

    await handleLtMaterialCommand(interactionFor({ 'title-slide': { url: 'https://cdn/slide.png' } }));

    expect(mocks.fetchXProfileImageUrl).not.toHaveBeenCalled();
  });

  it('そろっていれば告知画像を生成してポストに投稿する', async () => {
    const interaction = interactionFor({
      'title-slide': { url: 'https://cdn/slide.png' },
      icon: { url: 'https://cdn/icon.png' },
    });

    await handleLtMaterialCommand(interaction);

    expect(mocks.buildAnnounceImage).toHaveBeenCalled();
    expect(mocks.threadSend).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { users: ['speaker'] } }),
    );
    expect(interaction.editReply.mock.calls[0]![0]).toContain('告知画像を生成');
  });

  it('素材が変わっていなければ作り直さない', async () => {
    // 同じ画像をポストに投げ直さないための歯止め
    vi.mocked(ltStore.get).mockReturnValue(entry({
      materials: {
        speakerIconPath: '/materials/t1/speakerIcon.png',
        titleSlidePath: '/materials/t1/titleSlide.png',
        announceImagePath: '/materials/t1/announceImage.png',
      },
    }));

    await handleLtMaterialCommand(interactionFor({}));

    expect(mocks.buildAnnounceImage).not.toHaveBeenCalled();
    expect(mocks.threadSend).not.toHaveBeenCalled();
  });

  it('告知画像がまだ無ければ添付なしでも生成する', async () => {
    vi.mocked(ltStore.get).mockReturnValue(entry({
      materials: {
        speakerIconPath: '/materials/t1/speakerIcon.png',
        titleSlidePath: '/materials/t1/titleSlide.png',
        announceImagePath: null,
      },
    }));

    await handleLtMaterialCommand(interactionFor({}));

    expect(mocks.buildAnnounceImage).toHaveBeenCalled();
  });

  it('足りないものがあれば生成せずに何が要るかを返す', async () => {
    mocks.missingForAnnounceImage.mockReturnValue(['LT のタイトル']);
    const interaction = interactionFor({ 'title-slide': { url: 'https://cdn/slide.png' } });

    await handleLtMaterialCommand(interaction);

    expect(mocks.buildAnnounceImage).not.toHaveBeenCalled();
    expect(interaction.editReply.mock.calls[0]![0]).toContain('LT のタイトル');
  });

  it('ポストの外でも進行中の応募が1件なら対象にできる', async () => {
    // スレッド外なので、対象は「進行中の応募が1件だけ」という条件で決まる
    vi.mocked(ltStore.findBySpeaker).mockReturnValue([entry()]);

    const interaction = interactionFor({ icon: { url: 'https://cdn/icon.png' } }, { inThread: false });
    await handleLtMaterialCommand(interaction);

    expect(mocks.saveMaterialFromUrl).toHaveBeenCalledWith('t1', 'speakerIcon', 'https://cdn/icon.png');
  });

  it('進行中の応募が複数ならポスト内での実行を促す', async () => {
    vi.mocked(ltStore.get).mockReturnValue(undefined);
    vi.mocked(ltStore.findBySpeaker).mockReturnValue([entry(), entry({ id: 't2' })]);

    const interaction = interactionFor({}, { inThread: false });
    await handleLtMaterialCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('ポストの中で実行') }),
    );
    expect(mocks.saveMaterialFromUrl).not.toHaveBeenCalled();
  });

  it('本人でも運営でもなければ登録できない', async () => {
    const interaction = interactionFor({ icon: { url: 'https://cdn/icon.png' } }, { userId: 'other' });
    await handleLtMaterialCommand(interaction);

    expect(mocks.saveMaterialFromUrl).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('応募者本人') }),
    );
  });
});
