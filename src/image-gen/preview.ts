/**
 * 告知画像のプレビュー。テンプレート（.tsx / .css）を書き換えながら見た目を確かめる用。
 *
 *   npm run image:preview [出力先.png]
 *
 * サンプルの素材で描画して PNG を書き出す。CHROMIUM_PATH で Chromium の場所を指定できる。
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { closeBrowser } from './browser';
import { generateImage } from './generate';

const IMAGES = join(__dirname, 'assets/images');
const dataUrl = (name: string, mime: string) =>
  `data:${mime};base64,${readFileSync(join(IMAGES, name)).toString('base64')}`;

async function main() {
  const out = resolve(process.argv[2] ?? 'lt-announce-preview.png');
  const png = await generateImage({
    template: 'lt-announce',
    title: 'テストタイトルテストタイトル',
    speakerName: '慕狼ゆに',
    speakerIcon: dataUrl('test_icon__400x400.jpg', 'image/jpeg'),
    eventDate: '6月26日（金）',
    titleSlideImage: dataUrl('test_slide.png', 'image/png'),
  });
  writeFileSync(out, png);
  console.log(`書き出しました: ${out}`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeBrowser());
