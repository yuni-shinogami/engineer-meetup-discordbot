import { describe, it } from 'vitest';
import { generateImage, type ImageParams } from '../generate';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ASSETS = join(__dirname, '../assets/images');
const SNAPSHOTS_DIR = join(__dirname, '__snapshots__');

function toDataUrl(filePath: string, mimeType: string): string {
  return `data:${mimeType};base64,${readFileSync(filePath).toString('base64')}`;
}

async function assertMatchesSnapshot(buffer: Buffer, name: string): Promise<void> {
  const snapshotPath = join(SNAPSHOTS_DIR, `${name}.png`);
  const updating = process.env['UPDATE_SNAPSHOTS'] === '1';

  if (!existsSync(snapshotPath) || updating) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    writeFileSync(snapshotPath, buffer);
    console.log(`  snapshot ${updating ? 'updated' : 'created'}: ${snapshotPath}`);
    return;
  }

  const reference = readFileSync(snapshotPath);
  if (!buffer.equals(reference)) {
    const actualPath = join(SNAPSHOTS_DIR, `${name}.actual.png`);
    writeFileSync(actualPath, buffer);
    throw new Error(
      `Image snapshot mismatch: "${name}"\n` +
        `  actual:    ${actualPath}\n` +
        `  reference: ${snapshotPath}\n` +
        `  To update: UPDATE_SNAPSHOTS=1 npm test`,
    );
  }
}

describe('generateImage', () => {
  it('lt-announce テンプレートの出力が変化していない', async () => {
    const params: ImageParams = {
      template: 'lt-announce',
      title: 'テストタイトルテストタイトル',
      speakerName: '慕狼ゆに',
      speakerIcon: toDataUrl(join(ASSETS, 'test_icon__400x400.jpg'), 'image/jpeg'),
      eventDate: '6月27日',
      titleSlideImage: toDataUrl(join(ASSETS, 'test_slide.png'), 'image/png'),
    };

    const buffer = await generateImage(params);
    await assertMatchesSnapshot(buffer, 'lt-announce');
  }, 30000);
});
