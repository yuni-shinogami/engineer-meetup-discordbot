import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Asset } from './browser';

const CACHE_DIR = join(__dirname, '../../assets/fonts');
const CACHE_VERSION = 'v3';
const UA = 'Mozilla/5.0 (compatible; engineer-meetup-bot/1.0)';

async function downloadFont(weight: 400 | 700): Promise<Buffer> {
  const cacheFile = join(CACHE_DIR, `noto-sans-jp-${CACHE_VERSION}-${weight}.ttf`);
  if (existsSync(cacheFile)) {
    return readFileSync(cacheFile);
  }

  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}`,
    { headers: { 'User-Agent': UA } },
  ).then((r) => r.text());

  const [fontUrl] = [...css.matchAll(/url\(([^)]+)\)/g)]
    .map((m) => m[1])
    .filter((u): u is string => u !== undefined);

  if (!fontUrl) throw new Error(`Google Fonts: no URL found for weight ${weight}`);

  const fontBuffer = Buffer.from(await fetch(fontUrl).then((r) => r.bytes()));

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile, fontBuffer);
  console.log(`Font cached: ${cacheFile} (${fontBuffer.length.toLocaleString()} bytes)`);

  return fontBuffer;
}

const WEIGHTS = [400, 700] as const;

export interface FontBundle {
  /** テンプレートの <style> に入れる @font-face。 */
  css: string;
  /** `ASSET_ORIGIN` 以下で配るフォントファイル。 */
  assets: Map<string, Asset>;
}

let cachedFonts: FontBundle | null = null;

/**
 * テンプレートで `font-family: NotoSansJP` を使えるようにする。
 * ホストのフォントに頼らず、どこで描いても同じ字形になるよう Bot がフォントを配る。
 */
export async function loadFonts(): Promise<FontBundle> {
  if (cachedFonts) return cachedFonts;

  const buffers = await Promise.all(WEIGHTS.map(downloadFont));
  const assets = new Map<string, Asset>();
  const faces = WEIGHTS.map((weight, i) => {
    const path = `fonts/noto-sans-jp-${weight}.ttf`;
    assets.set(path, { body: buffers[i]!, contentType: 'font/ttf' });
    return `@font-face { font-family: 'NotoSansJP'; font-weight: ${weight}; font-style: normal; src: url('${path}') format('truetype'); }`;
  });

  cachedFonts = { css: faces.join('\n'), assets };
  return cachedFonts;
}
