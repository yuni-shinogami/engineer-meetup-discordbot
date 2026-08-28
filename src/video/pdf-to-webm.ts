import { execFile } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** ffmpeg は進捗を stderr に大量に出すので、既定の maxBuffer では足りない。 */
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { maxBuffer: MAX_OUTPUT_BYTES }, error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * PDF を 1 ページ 1 コマの webm にする。
 *
 * pdf2webm（https://github.com/vrc-lt/pdf2webm）がブラウザでやっていることを
 * サーバー側で同じ引数のまま再現する。あちらは pdf.js + ffmpeg.wasm、こちらは
 * poppler + ffmpeg で、エンコード条件（VP8 / -crf 4 / -b:v 5M / yuv420p）は揃えてある。
 *
 * VRChat の動画プレイヤーで流し、シークでページを送る使い方を前提にしている。
 */
export interface PdfToWebmOptions {
  /** 1 ページあたりの表示秒数。pdf2webm の「表示間隔」に対応。 */
  secondsPerPage?: number;
  /** 出力の高さ(px)。横幅は PDF の縦横比から決まる。 */
  height?: number;
}

/** ffmpeg が無いときに、入れ方まで含めて伝える。 */
export class FfmpegMissingError extends Error {
  constructor() {
    super('ffmpeg が見つかりません。`sudo apt install ffmpeg` で導入してください（VP8 エンコードに libvpx が必要です）。');
    this.name = 'FfmpegMissingError';
  }
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

export async function pdfToWebm(pdf: Buffer, options: PdfToWebmOptions = {}): Promise<Buffer> {
  const secondsPerPage = options.secondsPerPage ?? 1;
  const height = options.height ?? 1080;

  if (!await ffmpegAvailable()) throw new FfmpegMissingError();

  const dir = mkdtempSync(join(tmpdir(), 'pdf2webm-'));
  try {
    const pdfPath = join(dir, 'input.pdf');
    const outPath = join(dir, 'out.webm');
    writeFileSync(pdfPath, pdf);

    // -scale-to-x -1 で縦横比を保ったまま高さだけ揃える。
    // pdftoppm はページ数に応じて連番を 0 埋めするので、glob の並びとページ順が一致する。
    await run('pdftoppm', [
      '-png', '-scale-to-y', String(height), '-scale-to-x', '-1',
      pdfPath, join(dir, 'page'),
    ]);

    await run('ffmpeg', [
      '-y',
      // 入力側のフレームレート。1/2 なら 1 ページ 2 秒。
      '-framerate', `1/${secondsPerPage}`,
      '-pattern_type', 'glob', '-i', join(dir, 'page-*.png'),
      '-c:v', 'libvpx', '-crf', '4', '-b:v', '5000000',
      // yuv420p は幅・高さが偶数である必要がある。奇数になった場合に備えて丸める。
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-pix_fmt', 'yuv420p',
      outPath,
    ]);

    return readFileSync(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
