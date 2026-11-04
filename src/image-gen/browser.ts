import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import puppeteer, { type Browser } from 'puppeteer-core';

/**
 * 告知画像の描画に使うヘッドレス Chromium。
 *
 * Satori は対応している CSS が限られるため、本物のブラウザに HTML/CSS を描かせてスクリーンショットを撮る。
 * Chromium は Bot のホストに入っているもの（Debian なら `apt install chromium`）を使い、npm では落とさない。
 */
export const DEFAULT_CHROMIUM_PATH = '/usr/bin/chromium';

/** テンプレートが素材（フォント・画像）を読みに行く架空のオリジン。リクエストを横取りして中身を返す。 */
export const ASSET_ORIGIN = 'https://image-gen.local/';

/** 画像は週に数枚しか作らないので、使い終わったら少し待って閉じ、メモリを返す。 */
const IDLE_CLOSE_MS = 60_000;
const RENDER_TIMEOUT_MS = 30_000;

export interface Asset {
  body: Buffer;
  contentType: string;
}

export interface RenderOptions {
  html: string;
  width: number;
  height: number;
  /** `ASSET_ORIGIN` 以下のパス（先頭の / 抜き）→ 中身。 */
  assets: ReadonlyMap<string, Asset>;
}

export function chromiumPath(): string {
  return process.env.CHROMIUM_PATH || DEFAULT_CHROMIUM_PATH;
}

let browserPromise: Promise<Browser> | null = null;
let profileDir: string | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let activeRenders = 0;

async function launch(): Promise<Browser> {
  // 本番の systemd は HOME を読み取り専用にしているので、プロファイルも設定の置き場所も一時ディレクトリに寄せる
  const dir = mkdtempSync(join(tmpdir(), 'image-gen-'));
  profileDir = dir;
  const browser = await puppeteer.launch({
    executablePath: chromiumPath(),
    headless: true,
    userDataDir: dir,
    env: { ...process.env, HOME: dir, XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir },
    args: [
      // NoNewPrivileges の下では Chromium のサンドボックスが立ち上がらない。
      // 描くのは Bot が組み立てた HTML だけで、外部への通信も遮断している（render 参照）。
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--hide-scrollbars',
    ],
  });
  browser.on('disconnected', () => {
    browserPromise = null;
    cleanupProfile(dir);
  });
  return browser;
}

function cleanupProfile(dir: string): void {
  if (profileDir === dir) profileDir = null;
  rmSync(dir, { recursive: true, force: true });
}

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().catch(error => {
      browserPromise = null;
      throw new Error(
        `Chromium を起動できませんでした（${chromiumPath()}）。`
        + `Bot のホストに Chromium を入れるか、CHROMIUM_PATH を設定してください: ${error instanceof Error ? error.message : error}`,
      );
    });
  }
  return browserPromise;
}

function scheduleIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (activeRenders === 0) void closeBrowser();
  }, IDLE_CLOSE_MS);
  idleTimer.unref();
}

export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    await (await pending).close();
  } catch {
    // 起動に失敗していた・既に落ちていた場合は閉じるものが無い
  }
}

/** HTML を指定サイズで描画し、PNG を返す。 */
export async function renderHtmlToPng({ html, width, height, assets }: RenderOptions): Promise<Buffer> {
  activeRenders++;
  if (idleTimer) clearTimeout(idleTimer);
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = request.url();
        if (url.startsWith('data:')) return void request.continue();
        const asset = url.startsWith(ASSET_ORIGIN) ? assets.get(url.slice(ASSET_ORIGIN.length)) : undefined;
        // 素材はすべて Bot が渡す。テンプレートの書き間違いで外へ取りに行かないよう、それ以外は通さない
        if (!asset) return void request.abort();
        void request.respond({ status: 200, contentType: asset.contentType, body: asset.body });
      });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
      return Buffer.from(png);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    activeRenders--;
    scheduleIdleClose();
  }
}
