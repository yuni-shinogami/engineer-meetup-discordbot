import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { SatoriOptions } from 'satori';

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

let cachedFonts: SatoriOptions['fonts'] | null = null;

export async function loadFonts(): Promise<SatoriOptions['fonts']> {
  if (cachedFonts) return cachedFonts;

  const [regular, bold] = await Promise.all([downloadFont(400), downloadFont(700)]);

  cachedFonts = [
    { name: 'NotoSansJP', data: regular, weight: 400, style: 'normal' },
    { name: 'NotoSansJP', data: bold, weight: 700, style: 'normal' },
  ];

  return cachedFonts;
}
