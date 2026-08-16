import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { configMock } = vi.hoisted(() => ({ configMock: { ltMaterialsDir: '', ltMaxMaterialMb: 50 } }));

vi.mock('../../config', () => ({ config: configMock }));

import {
  MaterialError,
  materialDir,
  materialExists,
  materialSummary,
  maxMaterialBytes,
  readMaterialAsDataUrl,
  saveMaterialFromUrl,
  writeMaterial,
} from '../materials';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-materials-'));
  configMock.ltMaterialsDir = root;
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function imageResponse(contentType: string, body: Buffer) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

describe('writeMaterial', () => {
  it('レコードごとのディレクトリに種類名で保存する', () => {
    const filePath = writeMaterial('thread-1', 'speakerIcon', Buffer.from('icon'), 'png');

    expect(filePath).toBe(path.join(materialDir('thread-1'), 'speakerIcon.png'));
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('icon');
  });

  it('拡張子が変わっても同じ種類の古いファイルは残らない', () => {
    const png = writeMaterial('thread-2', 'titleSlide', Buffer.from('old'), 'png');
    const jpg = writeMaterial('thread-2', 'titleSlide', Buffer.from('new'), 'jpg');

    expect(fs.existsSync(png)).toBe(false);
    expect(fs.readFileSync(jpg, 'utf-8')).toBe('new');
    expect(fs.readdirSync(materialDir('thread-2'))).toEqual(['titleSlide.jpg']);
  });

  it('別の種類の素材は消さない', () => {
    const icon = writeMaterial('thread-3', 'speakerIcon', Buffer.from('icon'), 'png');
    writeMaterial('thread-3', 'titleSlide', Buffer.from('slide'), 'png');

    expect(fs.existsSync(icon)).toBe(true);
  });
});

describe('materialExists', () => {
  it('実在するファイルだけ true', () => {
    const filePath = writeMaterial('thread-4', 'speakerIcon', Buffer.from('x'), 'png');

    expect(materialExists(filePath)).toBe(true);
    expect(materialExists(null)).toBe(false);
    expect(materialExists('')).toBe(false);
    // 手動で消された場合に気づけること
    fs.unlinkSync(filePath);
    expect(materialExists(filePath)).toBe(false);
  });
});

describe('readMaterialAsDataUrl', () => {
  it('拡張子から MIME を決めて data URL にする', () => {
    const png = writeMaterial('thread-5', 'speakerIcon', Buffer.from('a'), 'png');
    const jpg = writeMaterial('thread-5', 'titleSlide', Buffer.from('a'), 'jpg');

    expect(readMaterialAsDataUrl(png)).toBe(`data:image/png;base64,${Buffer.from('a').toString('base64')}`);
    expect(readMaterialAsDataUrl(jpg)).toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe('saveMaterialFromUrl', () => {
  it('取得した画像を保存し、Content-Type から拡張子を決める', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse('image/jpeg', Buffer.from('jpeg-bytes'))));

    const filePath = await saveMaterialFromUrl('thread-6', 'speakerIcon', 'https://example.com/a');

    expect(path.extname(filePath)).toBe('.jpg');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('jpeg-bytes');
  });

  it('charset 付きの Content-Type でも判定できる', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse('image/PNG; charset=binary', Buffer.from('x'))));

    const filePath = await saveMaterialFromUrl('thread-7', 'speakerIcon', 'https://example.com/a');
    expect(path.extname(filePath)).toBe('.png');
  });

  it('画像以外は利用者が直せるエラーとして弾く', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse('application/pdf', Buffer.from('x'))));

    await expect(saveMaterialFromUrl('thread-8', 'titleSlide', 'https://example.com/a'))
      .rejects.toThrow(MaterialError);
  });

  it('設定した上限を超える画像だけを弾く', async () => {
    // Discord が通した添付は基本的に受けたいので、上限は設定で動かせる
    expect(maxMaterialBytes()).toBe(50 * 1024 * 1024);

    vi.stubGlobal('fetch', vi.fn(async () => imageResponse('image/png', Buffer.alloc(12 * 1024 * 1024))));
    await expect(saveMaterialFromUrl('thread-9', 'titleSlide', 'https://example.com/a'))
      .resolves.toContain('titleSlide.png');

    vi.stubGlobal('fetch', vi.fn(async () => imageResponse('image/png', Buffer.alloc(maxMaterialBytes() + 1))));
    await expect(saveMaterialFromUrl('thread-9', 'titleSlide', 'https://example.com/a'))
      .rejects.toThrow(/大きすぎます.*50MB/s);
  });

  it('取得に失敗したら保存しない', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    })));

    await expect(saveMaterialFromUrl('thread-10', 'titleSlide', 'https://example.com/a'))
      .rejects.toThrow(/HTTP 404/);
    expect(fs.existsSync(materialDir('thread-10'))).toBe(false);
  });
});

describe('materialSummary', () => {
  it('そろっていない素材が一目で分かる', () => {
    const icon = writeMaterial('thread-11', 'speakerIcon', Buffer.from('x'), 'png');
    const summary = materialSummary({
      speakerIconPath: icon,
      titleSlidePath: null,
      announceImagePath: null,
    });

    expect(summary).toContain('✅ アイコン');
    expect(summary).toContain('❌ スライド');
    expect(summary).toContain('❌ 告知画像');
  });
});
