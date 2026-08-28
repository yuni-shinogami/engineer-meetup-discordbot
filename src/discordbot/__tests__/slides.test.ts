import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportDesignAsPdf: vi.fn(),
  pdfToWebm: vi.fn(),
  config: {
    canvaSlideDesignId: 'DAG123',
    canvaMaxPdfMb: 50,
    ltDateCandidates: 8,
    meetupWeekday: 5,
    slidesVideoSeconds: 1,
    slidesVideoHeight: 1080,
  },
}));

vi.mock('../../canva/export', () => ({ exportDesignAsPdf: mocks.exportDesignAsPdf }));
vi.mock('../../video/pdf-to-webm', () => ({ pdfToWebm: mocks.pdfToWebm }));
vi.mock('../config', () => ({ config: mocks.config }));

import { buildSlidesAttachment, postSlidesToChannel, slidesFileName, slidesMessage } from '../slides';

/** 2026-08-19 は水曜。直近の金曜は 2026-08-21。 */
const WEDNESDAY = new Date(2026, 7, 19);

const pdfOf = (mb: number) => Buffer.alloc(Math.round(mb * 1024 * 1024), 0x20);

describe('slidesFileName', () => {
  it('直近の集会日と形式を名前に入れる', () => {
    expect(slidesFileName('webm', WEDNESDAY)).toBe('meetup-slides-2026-08-21.webm');
    expect(slidesFileName('pdf', WEDNESDAY)).toBe('meetup-slides-2026-08-21.pdf');
  });
});

describe('slidesMessage', () => {
  it('集会日とサイズを添える', () => {
    expect(slidesMessage(3.96, 'pdf', WEDNESDAY)).toContain('8月21日(金)');
    expect(slidesMessage(3.96, 'pdf', WEDNESDAY)).toContain('4.0MB');
  });

  it('webm のときは VRChat での使い方を添える', () => {
    expect(slidesMessage(8, 'webm', WEDNESDAY)).toContain('VRChat');
    expect(slidesMessage(8, 'pdf', WEDNESDAY)).not.toContain('VRChat');
  });
});

describe('buildSlidesAttachment', () => {
  beforeEach(() => {
    mocks.exportDesignAsPdf.mockReset();
    mocks.pdfToWebm.mockReset();
    mocks.config.canvaSlideDesignId = 'DAG123';
    mocks.config.canvaMaxPdfMb = 50;
  });

  it('設定されたデザインをエクスポートする', async () => {
    mocks.exportDesignAsPdf.mockResolvedValue(pdfOf(4));
    const { sizeMb } = await buildSlidesAttachment('pdf', WEDNESDAY);

    expect(mocks.exportDesignAsPdf).toHaveBeenCalledWith('DAG123');
    expect(sizeMb).toBeCloseTo(4, 1);
  });

  it('既定では PDF を webm に変換して返す', async () => {
    // 中身の比較は Buffer が大きいと遅いので、同一性と変換設定だけ見る
    const pdf = pdfOf(4);
    mocks.exportDesignAsPdf.mockResolvedValue(pdf);
    mocks.pdfToWebm.mockResolvedValue(pdfOf(8));

    const { format, sizeMb } = await buildSlidesAttachment(undefined, WEDNESDAY);

    const [passedPdf, opts] = mocks.pdfToWebm.mock.calls[0]!;
    expect(passedPdf).toBe(pdf);
    expect(opts).toEqual({ secondsPerPage: 1, height: 1080 });
    expect(format).toBe('webm');
    expect(sizeMb).toBeCloseTo(8, 1);
  });

  it('pdf 指定なら変換しない', async () => {
    mocks.exportDesignAsPdf.mockResolvedValue(pdfOf(4));

    await buildSlidesAttachment('pdf', WEDNESDAY);

    expect(mocks.pdfToWebm).not.toHaveBeenCalled();
  });

  it('デザインIDが未設定なら分かる形で失敗する', async () => {
    mocks.config.canvaSlideDesignId = '';
    await expect(buildSlidesAttachment('pdf', WEDNESDAY)).rejects.toThrow(/CANVA_SLIDE_DESIGN_ID/);
    expect(mocks.exportDesignAsPdf).not.toHaveBeenCalled();
  });

  it('添付上限を超えたら投稿せずサイズを知らせる', async () => {
    mocks.config.canvaMaxPdfMb = 10;
    mocks.exportDesignAsPdf.mockResolvedValue(pdfOf(53.4));

    await expect(buildSlidesAttachment('pdf', WEDNESDAY)).rejects.toThrow(/53\.4MB.*10MB/);
  });

  it('上限ちょうどは通す', async () => {
    mocks.config.canvaMaxPdfMb = 10;
    mocks.exportDesignAsPdf.mockResolvedValue(pdfOf(10));

    await expect(buildSlidesAttachment('pdf', WEDNESDAY)).resolves.toBeDefined();
  });
});

describe('postSlidesToChannel', () => {
  interface SendPayload { content: string; files?: unknown[] }

  function clientWith(send: (p: SendPayload | string) => Promise<unknown>) {
    return { channels: { fetch: vi.fn(async () => ({ send })) } } as never;
  }

  beforeEach(() => {
    mocks.exportDesignAsPdf.mockReset();
    mocks.pdfToWebm.mockReset();
    mocks.pdfToWebm.mockResolvedValue(pdfOf(8));
    mocks.config.canvaSlideDesignId = 'DAG123';
    mocks.config.canvaMaxPdfMb = 50;
  });

  it('動画を添付して投稿する', async () => {
    mocks.exportDesignAsPdf.mockResolvedValue(pdfOf(4));
    const send = vi.fn(async (_p: SendPayload | string) => undefined);

    await postSlidesToChannel(clientWith(send), 'ch-1');

    const payload = send.mock.calls[0]![0] as SendPayload;
    expect(payload.files).toHaveLength(1);
    expect(payload.content).toContain('司会進行スライド');
  });

  it('取得に失敗しても投げず、理由をチャンネルに残す', async () => {
    mocks.exportDesignAsPdf.mockRejectedValue(new Error('Canva が落ちています'));
    const send = vi.fn(async (_p: SendPayload | string) => undefined);

    await expect(postSlidesToChannel(clientWith(send), 'ch-1')).resolves.toBeUndefined();
    expect(send.mock.calls[0]![0]).toContain('Canva が落ちています');
  });

  it('通知の送信自体が失敗しても投げない', async () => {
    mocks.exportDesignAsPdf.mockRejectedValue(new Error('だめ'));
    const send = vi.fn(async () => { throw new Error('送信もだめ'); });

    await expect(postSlidesToChannel(clientWith(send), 'ch-1')).resolves.toBeUndefined();
  });

  it('チャンネルを取得できなければ何もしない', async () => {
    mocks.exportDesignAsPdf.mockResolvedValue(pdfOf(4));
    const client = { channels: { fetch: vi.fn(async () => { throw new Error('404'); }) } } as never;

    await expect(postSlidesToChannel(client, 'ch-1')).resolves.toBeUndefined();
    expect(mocks.exportDesignAsPdf).not.toHaveBeenCalled();
  });
});
