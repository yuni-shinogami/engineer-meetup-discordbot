import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type RequestHandler = (request: ReturnType<typeof fakeRequest>) => void;

const mocks = vi.hoisted(() => {
  const state = { handler: null as RequestHandler | null };
  const page = {
    setDefaultTimeout: vi.fn(),
    setViewport: vi.fn(async () => {}),
    setRequestInterception: vi.fn(async () => {}),
    on: vi.fn((_event: string, handler: RequestHandler) => { state.handler = handler; }),
    setContent: vi.fn(async () => {}),
    // 読み込みに失敗したフォント
    evaluate: vi.fn(async (): Promise<string[]> => []),
    screenshot: vi.fn(async () => new Uint8Array([1, 2, 3])),
    close: vi.fn(async () => {}),
  };
  const browser = { newPage: vi.fn(async () => page), on: vi.fn(), close: vi.fn(async () => {}) };
  const launch = vi.fn(async (_options: Record<string, unknown>) => browser);
  return { state, page, browser, launch };
});

vi.mock('puppeteer-core', () => ({ default: { launch: mocks.launch } }));

import { ASSET_ORIGIN, closeBrowser, renderHtmlToPng } from '../browser';

function fakeRequest(url: string) {
  return { url: () => url, continue: vi.fn(), abort: vi.fn(), respond: vi.fn() };
}

const font = { body: Buffer.from('font'), contentType: 'font/ttf' };
const render = () => renderHtmlToPng({
  html: '<p>hi</p>',
  width: 1200,
  height: 1600,
  assets: new Map([['fonts/a.ttf', font]]),
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await closeBrowser();
  delete process.env.CHROMIUM_PATH;
});

describe('renderHtmlToPng', () => {
  it('指定サイズで描いた PNG を返し、ページを閉じる', async () => {
    const png = await render();

    expect(png).toEqual(Buffer.from([1, 2, 3]));
    expect(mocks.page.setViewport).toHaveBeenCalledWith({ width: 1200, height: 1600, deviceScaleFactor: 1 });
    expect(mocks.page.screenshot).toHaveBeenCalledWith({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 1600 } });
    expect(mocks.page.close).toHaveBeenCalled();
  });

  it('ホストの Chromium を使う（CHROMIUM_PATH で変えられる）', async () => {
    process.env.CHROMIUM_PATH = '/opt/chrome/chrome';
    await render();
    expect(mocks.launch.mock.calls[0]![0]).toMatchObject({ executablePath: '/opt/chrome/chrome' });
  });

  it('ブラウザは描画のたびに起動し直さない', async () => {
    await render();
    await render();
    expect(mocks.launch).toHaveBeenCalledTimes(1);
  });

  describe('素材のリクエスト', () => {
    it('配っている素材はその中身を返す', async () => {
      await render();
      const request = fakeRequest(`${ASSET_ORIGIN}fonts/a.ttf`);
      mocks.state.handler!(request);
      expect(request.respond).toHaveBeenCalledWith({
        status: 200,
        contentType: 'font/ttf',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: font.body,
      });
    });

    it('data URL はそのまま通す', async () => {
      await render();
      const request = fakeRequest('data:image/png;base64,AAAA');
      mocks.state.handler!(request);
      expect(request.continue).toHaveBeenCalled();
    });

    // テンプレートの書き間違いで外部へ取りに行かない
    it('外部の URL と、配っていない素材は遮断する', async () => {
      await render();
      for (const url of ['https://example.com/a.png', `${ASSET_ORIGIN}fonts/missing.ttf`]) {
        const request = fakeRequest(url);
        mocks.state.handler!(request);
        expect(request.abort).toHaveBeenCalled();
        expect(request.respond).not.toHaveBeenCalled();
      }
    });
  });

  // 代わりのフォントで描くと日本語が豆腐になる
  it('フォントが読み込めなければ、画像を返さずエラーにする', async () => {
    mocks.page.evaluate.mockResolvedValueOnce(['NotoSansJP 700']);
    await expect(render()).rejects.toThrow('フォントを読み込めませんでした: NotoSansJP 700');
    expect(mocks.page.screenshot).not.toHaveBeenCalled();
    expect(mocks.page.close).toHaveBeenCalled();
  });

  it('Chromium が起動できなければ、入れ方の分かるエラーにする', async () => {
    mocks.launch.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(render()).rejects.toThrow(/Chromium を起動できませんでした.*CHROMIUM_PATH/);
  });
});
