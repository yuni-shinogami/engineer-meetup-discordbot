import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }));

vi.mock('child_process', () => ({ execFile: mocks.execFile }));

import { ffmpegAvailable, FfmpegMissingError, pdfToWebm } from '../pdf-to-webm';

/** promisify(execFile) が使う callback 形式に合わせる。options の有無で位置が変わる。 */
function respond(fail?: (cmd: string) => boolean) {
  mocks.execFile.mockImplementation((...args: unknown[]) => {
    const cmd = args[0] as string;
    const cb = args.find(a => typeof a === 'function') as
      ((e: Error | null, r?: unknown) => void) | undefined;
    if (!cb) throw new Error('callback が渡されていません');
    if (fail?.(cmd)) cb(new Error(`${cmd}: not found`));
    else cb(null, { stdout: '', stderr: '' });
  });
}

/** 実行時の引数。ffmpeg は存在確認（-version）を挟むので、最後の呼び出しを見る。 */
function argsFor(cmd: string): string[] {
  const calls = mocks.execFile.mock.calls.filter(c => c[0] === cmd);
  return (calls[calls.length - 1]?.[1] ?? []) as string[];
}

describe('ffmpegAvailable', () => {
  beforeEach(() => { mocks.execFile.mockReset(); });

  it('ffmpeg があれば true', async () => {
    respond();
    expect(await ffmpegAvailable()).toBe(true);
  });

  it('無ければ false', async () => {
    respond(cmd => cmd === 'ffmpeg');
    expect(await ffmpegAvailable()).toBe(false);
  });
});

describe('pdfToWebm', () => {
  beforeEach(() => { mocks.execFile.mockReset(); });

  it('ffmpeg が無ければ導入方法を添えて失敗する', async () => {
    respond(cmd => cmd === 'ffmpeg');
    await expect(pdfToWebm(Buffer.from('%PDF-'))).rejects.toBeInstanceOf(FfmpegMissingError);
    await expect(pdfToWebm(Buffer.from('%PDF-'))).rejects.toThrow(/apt install ffmpeg/);
  });

  it('pdftoppm で高さを揃えて PNG にする', async () => {
    respond();
    await pdfToWebm(Buffer.from('%PDF-'), { height: 720 }).catch(() => undefined);

    const args = argsFor('pdftoppm');
    expect(args).toContain('-png');
    // -scale-to-x -1 で縦横比が保たれる
    expect(args.slice(args.indexOf('-scale-to-y'), args.indexOf('-scale-to-y') + 2)).toEqual(['-scale-to-y', '720']);
    expect(args.slice(args.indexOf('-scale-to-x'), args.indexOf('-scale-to-x') + 2)).toEqual(['-scale-to-x', '-1']);
  });

  it('pdf2webm と同じエンコード条件を使う', async () => {
    respond();
    await pdfToWebm(Buffer.from('%PDF-')).catch(() => undefined);

    const args = argsFor('ffmpeg');
    expect(args).toContain('libvpx');
    expect(args.slice(args.indexOf('-crf'), args.indexOf('-crf') + 2)).toEqual(['-crf', '4']);
    expect(args.slice(args.indexOf('-b:v'), args.indexOf('-b:v') + 2)).toEqual(['-b:v', '5000000']);
    expect(args.slice(args.indexOf('-pix_fmt'), args.indexOf('-pix_fmt') + 2)).toEqual(['-pix_fmt', 'yuv420p']);
  });

  it('表示秒数を入力フレームレートに変換する', async () => {
    respond();
    await pdfToWebm(Buffer.from('%PDF-'), { secondsPerPage: 2 }).catch(() => undefined);

    const args = argsFor('ffmpeg');
    expect(args.slice(args.indexOf('-framerate'), args.indexOf('-framerate') + 2)).toEqual(['-framerate', '1/2']);
  });

  it('既定は 1 ページ 1 秒・1080p', async () => {
    respond();
    await pdfToWebm(Buffer.from('%PDF-')).catch(() => undefined);

    expect(argsFor('ffmpeg')).toContain('1/1');
    expect(argsFor('pdftoppm')).toContain('1080');
  });
});
