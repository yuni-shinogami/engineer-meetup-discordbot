import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LtEntry } from '../types';

const { generateImage } = vi.hoisted(() => ({
  generateImage: vi.fn(async () => Buffer.from('png')),
}));

vi.mock('../../../image-gen/generate', () => ({ generateImage }));

vi.mock('../materials', () => ({
  materialExists: (p: unknown) => typeof p === 'string' && p !== '',
  readMaterialAsDataUrl: (p: string) => `data:image/png;base64,${p}`,
  writeMaterial: vi.fn(() => '/materials/t1/announceImage.png'),
}));

vi.mock('../store', () => ({
  ltStore: { update: vi.fn((id: string, patch: object) => ({ ...entry({ id }), ...patch })) },
}));

import { ltStore } from '../store';
import {
  buildAnnounceImage,
  missingForAnnounceImage,
  postAnnounceImage,
  syncAnnounceImage,
  renderAnnounceImage,
} from '../announce-image';

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
  materials: {
    speakerIconPath: '/materials/t1/speakerIcon.png',
    titleSlidePath: '/materials/t1/titleSlide.png',
    announceImagePath: null,
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

beforeEach(() => {
  vi.clearAllMocks();
  generateImage.mockResolvedValue(Buffer.from('png'));
});

describe('missingForAnnounceImage', () => {
  it('そろっていれば空', () => {
    expect(missingForAnnounceImage(entry())).toEqual([]);
  });

  it('開催日・タイトル・素材の不足をそれぞれ挙げる', () => {
    expect(missingForAnnounceImage(entry({ eventDate: null })).join()).toContain('開催日');
    expect(missingForAnnounceImage(entry({ title: '未定' })).join()).toContain('タイトル');
    expect(missingForAnnounceImage(entry({
      materials: { speakerIconPath: null, titleSlidePath: '/x', announceImagePath: null },
    })).join()).toContain('アイコン');
    expect(missingForAnnounceImage(entry({
      materials: { speakerIconPath: '/x', titleSlidePath: null, announceImagePath: null },
    })).join()).toContain('スライド');
  });
});

describe('renderAnnounceImage', () => {
  it('レコードの内容をテンプレートに渡す', async () => {
    await renderAnnounceImage(entry());

    expect(generateImage).toHaveBeenCalledWith({
      template: 'lt-announce',
      title: '型で殴る話',
      speakerName: 'ゆに',
      speakerIcon: 'data:image/png;base64,/materials/t1/speakerIcon.png',
      eventDate: '9月4日',
      titleSlideImage: 'data:image/png;base64,/materials/t1/titleSlide.png',
    });
  });

  it('素材が欠けていれば描画せずに落とす', async () => {
    await expect(renderAnnounceImage(entry({ title: '未定' }))).rejects.toThrow(/タイトル/);
    expect(generateImage).not.toHaveBeenCalled();
  });
});

describe('buildAnnounceImage', () => {
  it('画像がそろった時点で準備完了に上げる', async () => {
    await buildAnnounceImage(entry({ status: 'scheduled' }));

    expect(ltStore.update).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'ready' }));
  });

  it('告知済み以降のステータスは巻き戻さない', async () => {
    await buildAnnounceImage(entry({ status: 'announced' }));

    expect(ltStore.update).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'announced' }));
  });

  it('生成した画像のパスをレコードに残す', async () => {
    await buildAnnounceImage(entry());

    expect(ltStore.update).toHaveBeenCalledWith('t1', expect.objectContaining({
      materials: expect.objectContaining({ announceImagePath: '/materials/t1/announceImage.png' }),
    }));
  });
});

describe('syncAnnounceImage', () => {
  // 素材の登録が日程確定より先だと、ここが初回生成になる（未生成でも作らないと画像なしで告知される）
  it('素材がそろっていれば未生成でも生成する', async () => {
    const updated = await syncAnnounceImage(entry());

    expect(generateImage).toHaveBeenCalled();
    expect(updated.materials.announceImagePath).toBe('/materials/t1/announceImage.png');
  });

  it('生成済みならレコードの現在値で作り直す', async () => {
    await syncAnnounceImage(entry({
      materials: {
        speakerIconPath: '/materials/t1/speakerIcon.png',
        titleSlidePath: '/materials/t1/titleSlide.png',
        announceImagePath: '/materials/t1/announceImage.png',
      },
    }));

    expect(generateImage).toHaveBeenCalled();
  });

  it('素材が足りなければ何もしない', async () => {
    const current = entry({ eventDate: null });

    expect(await syncAnnounceImage(current)).toBe(current);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('生成に失敗しても呼び出し元は止めずレコードをそのまま返す', async () => {
    const current = entry();
    generateImage.mockRejectedValueOnce(new Error('satori failed'));

    expect(await syncAnnounceImage(current)).toBe(current);
  });
});

describe('postAnnounceImage', () => {
  interface SendPayload {
    content: string;
    files: unknown[];
    allowedMentions: { users: string[] };
  }
  const thread = () => ({ send: vi.fn(async (_payload: SendPayload) => undefined) });

  it('生成済みの画像を登壇者宛にポストへ投稿する', async () => {
    const t = thread();
    await postAnnounceImage(t as never, entry({
      materials: {
        speakerIconPath: '/materials/t1/speakerIcon.png',
        titleSlidePath: '/materials/t1/titleSlide.png',
        announceImagePath: '/materials/t1/announceImage.png',
      },
    }));

    const payload = t.send.mock.calls[0]![0];
    expect(payload.content).toContain('<@speaker>');
    expect(payload.files).toHaveLength(1);
    // 本文に登壇者以外へのメンションを飛ばさない
    expect(payload.allowedMentions).toEqual({ users: ['speaker'] });
  });

  it('画像が無ければ投稿しない', async () => {
    const t = thread();
    await postAnnounceImage(t as never, entry());

    expect(t.send).not.toHaveBeenCalled();
  });

  // 表示の同期と同じ扱い。投稿に失敗しても日程確定そのものは成立させる
  it('投稿に失敗しても例外を投げない', async () => {
    const t = { send: vi.fn(async (_payload: SendPayload) => { throw new Error('Missing Permissions'); }) };

    await expect(postAnnounceImage(t as never, entry({
      materials: {
        speakerIconPath: '/materials/t1/speakerIcon.png',
        titleSlidePath: '/materials/t1/titleSlide.png',
        announceImagePath: '/materials/t1/announceImage.png',
      },
    }))).resolves.toBeUndefined();
  });
});
