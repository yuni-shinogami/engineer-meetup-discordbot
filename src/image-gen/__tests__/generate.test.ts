import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildDocument, generateImage, type ImageParams } from '../generate';
import { chromiumPath, closeBrowser } from '../browser';
import { LT_ANNOUNCE_SIZE, LtAnnounceTemplate } from '../templates/lt-announce';

const ASSETS = join(__dirname, '../assets/images');
const OUTPUT_DIR = join(__dirname, '__output__');

function toDataUrl(filePath: string, mimeType: string): string {
  return `data:${mimeType};base64,${readFileSync(filePath).toString('base64')}`;
}

const props = {
  title: 'テストタイトル<script>',
  speakerName: '慕狼ゆに',
  speakerIcon: 'data:image/png;base64,AAAA',
  eventDate: '6月27日',
  titleSlideImage: 'data:image/png;base64,BBBB',
};

describe('buildDocument', () => {
  const html = buildDocument(LtAnnounceTemplate(props), '.x { color: red; }', '@font-face {}', LT_ANNOUNCE_SIZE);

  it('素材を相対パスで書けるよう、配るオリジンを基準にする', () => {
    expect(html).toContain('<base href="https://image-gen.local/">');
  });

  it('フォントとテンプレートの CSS を入れ、画像のサイズに合わせる', () => {
    expect(html).toContain('@font-face {}');
    expect(html).toContain('.x { color: red; }');
    expect(html).toContain('width: 1200px; height: 1600px');
  });

  // 登壇者が入力したタイトルがそのまま HTML になるので、タグとして解釈させない
  it('差し込む文字列をエスケープする', () => {
    expect(html).toContain('テストタイトル&lt;script&gt;');
    expect(html).not.toContain('テストタイトル<script>');
  });
});

// Chromium が入っていない環境（開発機など）では描画のテストを飛ばす。CHROMIUM_PATH で場所を指定できる
describe.runIf(existsSync(chromiumPath()))('generateImage', () => {
  afterAll(() => closeBrowser());

  it('lt-announce を 1200x1600 の PNG に描く', async () => {
    const params: ImageParams = {
      template: 'lt-announce',
      title: 'テストタイトルテストタイトル',
      speakerName: '慕狼ゆに',
      speakerIcon: toDataUrl(join(ASSETS, 'test_icon__400x400.jpg'), 'image/jpeg'),
      eventDate: '6月27日',
      titleSlideImage: toDataUrl(join(ASSETS, 'test_slide.png'), 'image/png'),
    };

    const png = await generateImage(params);

    // PNG の IHDR から幅と高さを読む
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(1600);

    // 見た目は目で確かめる（Chromium の版で画素が揺れるので、画像の一致は見ない）
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(join(OUTPUT_DIR, 'lt-announce.png'), png);
  }, 60_000);
});
