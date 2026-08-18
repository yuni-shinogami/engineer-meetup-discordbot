import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { LtEntry } from './types';

/** 保存する素材の種類。ファイル名の先頭になる。 */
export const MATERIAL_KINDS = ['speakerIcon', 'titleSlide', 'announceImage'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/**
 * 受け付ける画像形式。
 * 告知画像の生成に satori を使うため、確実に描画できる形式に絞っている。
 */
const EXTENSION_BY_MIME = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

const MIME_BY_EXTENSION = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
]);

/** 受け付ける上限（バイト）。設定を後から変えられるよう、都度 config から求める。 */
export function maxMaterialBytes(): number {
  return config.ltMaxMaterialMb * 1024 * 1024;
}

/** 素材の受け取りに失敗した理由のうち、そのまま利用者に見せてよいもの。 */
export class MaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaterialError';
  }
}

export function materialDir(entryId: string): string {
  return path.join(config.ltMaterialsDir, entryId);
}

/**
 * 素材をレコードごとのディレクトリに保存する。
 * 同じ種類の既存ファイルは拡張子が違っても消してから書くので、
 * PNG → JPEG と差し替えたときに古い方が残ってしまうことはない。
 */
export function writeMaterial(
  entryId: string,
  kind: MaterialKind,
  buffer: Buffer,
  extension: string,
): string {
  const dir = materialDir(entryId);
  fs.mkdirSync(dir, { recursive: true });

  for (const existing of fs.readdirSync(dir)) {
    if (existing.startsWith(`${kind}.`)) fs.unlinkSync(path.join(dir, existing));
  }

  const filePath = path.join(dir, `${kind}.${extension}`);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, filePath);
  return filePath;
}

/**
 * URL から素材を取得して保存する。
 *
 * Discord の添付 URL は署名付きで約24時間で失効するため、URL を控えるのではなく
 * その場で実体をダウンロードして保持する。X のプロフィール画像も同じ経路で受け取る。
 */
export async function saveMaterialFromUrl(
  entryId: string,
  kind: MaterialKind,
  url: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new MaterialError(`素材を取得できませんでした: ${error instanceof Error ? error.message : error}`);
  }
  if (!response.ok) {
    throw new MaterialError(`素材を取得できませんでした (HTTP ${response.status})`);
  }

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const extension = EXTENSION_BY_MIME.get(contentType);
  if (!extension) {
    throw new MaterialError(
      `対応していない画像形式です（${contentType || '形式不明'}）。PNG / JPEG / WebP のいずれかでお願いします。`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxMaterialBytes()) {
    const mb = (buffer.byteLength / 1024 / 1024).toFixed(1);
    throw new MaterialError(
      `画像が大きすぎます（${mb}MB）。${config.ltMaxMaterialMb}MB 以下にしてください。`,
    );
  }

  return writeMaterial(entryId, kind, buffer, extension);
}

/** レコードが指すファイルが実在するか。手で消された場合に気づけるよう、毎回確認する。 */
export function materialExists(filePath: string | null | undefined): filePath is string {
  return typeof filePath === 'string' && filePath !== '' && fs.existsSync(filePath);
}

/** 保存済みの素材を satori に渡せる data URL にする。 */
export function readMaterialAsDataUrl(filePath: string): string {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const mime = MIME_BY_EXTENSION.get(extension) ?? 'image/png';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

/** ポストの埋め込みに出す素材のそろい具合。 */
export function materialSummary(materials: LtEntry['materials']): string {
  const mark = (filePath: string | null) => (materialExists(filePath) ? '✅' : '❌');
  return [
    `${mark(materials.speakerIconPath)} アイコン`,
    `${mark(materials.titleSlidePath)} スライド`,
    `${mark(materials.announceImagePath)} 告知画像`,
  ].join('\n');
}
