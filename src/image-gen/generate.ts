import { readFileSync } from 'fs';
import { extname, join } from 'path';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ASSET_ORIGIN, renderHtmlToPng, type Asset } from './browser';
import { loadFonts } from './fonts';
import { LT_ANNOUNCE_SIZE, LtAnnounceTemplate, type LtAnnounceTemplateProps } from './templates/lt-announce';

export interface LtAnnounceParams extends LtAnnounceTemplateProps {
  template: 'lt-announce';
}

export type ImageParams = LtAnnounceParams;

const TEMPLATES_DIR = join(__dirname, 'templates');
const IMAGES_DIR = join(__dirname, 'assets/images');

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/** テンプレートから `assets/images/<ファイル名>` で参照できる画像。 */
function imageAssets(): Map<string, Asset> {
  const assets = new Map<string, Asset>();
  for (const name of ['em_logo_620px_A.png']) {
    assets.set(`assets/images/${name}`, {
      body: readFileSync(join(IMAGES_DIR, name)),
      contentType: MIME_BY_EXTENSION[extname(name)] ?? 'application/octet-stream',
    });
  }
  return assets;
}

/** テンプレートの CSS は毎回読み直す（プレビューで書き換えをすぐ反映するため）。 */
function templateCss(name: ImageParams['template']): string {
  return readFileSync(join(TEMPLATES_DIR, `${name}.css`), 'utf-8');
}

/** テンプレートの要素を、フォントと CSS を添えた 1 枚の HTML にする。 */
export function buildDocument(element: ReactElement, css: string, fontCss: string, size: { width: number; height: number }): string {
  return [
    '<!doctype html>',
    '<html lang="ja"><head><meta charset="utf-8">',
    // 素材は相対パスで書けるよう、配るオリジンを基準にする
    `<base href="${ASSET_ORIGIN}">`,
    `<style>${fontCss}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; width: ${size.width}px; height: ${size.height}px; overflow: hidden; }
body { font-family: 'NotoSansJP', sans-serif; }
</style>`,
    `<style>${css}</style>`,
    '</head><body>',
    renderToStaticMarkup(element),
    '</body></html>',
  ].join('');
}

export async function generateImage(params: ImageParams): Promise<Buffer> {
  const fonts = await loadFonts();
  const { template, ...props } = params;
  const size = LT_ANNOUNCE_SIZE;

  const html = buildDocument(LtAnnounceTemplate(props), templateCss(template), fonts.css, size);
  return renderHtmlToPng({
    html,
    ...size,
    assets: new Map([...fonts.assets, ...imageAssets()]),
  });
}
