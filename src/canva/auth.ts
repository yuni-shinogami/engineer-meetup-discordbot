import axios from 'axios';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../discordbot/config';

export const AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';
const TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

/** PDF エクスポートに必要なスコープ。Canva は暗黙の昇格をしないので明示的に並べる。 */
export const CANVA_SCOPES = ['design:content:read'] as const;

/**
 * アクセストークンの寿命は 4 時間。期限ちょうどまで使うと、
 * リクエスト中に切れて 401 になるので手前で切り上げる。
 */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export interface CanvaTokenFile {
  /** 単発使用のリフレッシュトークン。更新のたびに新しい値へ入れ替わる。 */
  refreshToken: string;
  updatedAt: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/** 再認可が必要な状態。運営が復旧手順を判断できるよう、他の失敗と型で区別する。 */
export class CanvaReauthRequiredError extends Error {
  constructor(reason: string) {
    super(`Canva の再認可が必要です（${reason}）。\`npm run canva:login\` を実行してください。`);
    this.name = 'CanvaReauthRequiredError';
  }
}

export function tokenFilePath(): string {
  return join(config.canvaStateDir, 'canva-tokens.json');
}

export function readTokenFile(): CanvaTokenFile | null {
  const path = tokenFilePath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<CanvaTokenFile>;
    return typeof parsed.refreshToken === 'string' && parsed.refreshToken !== ''
      ? { refreshToken: parsed.refreshToken, updatedAt: parsed.updatedAt ?? '' }
      : null;
  } catch {
    return null;
  }
}

/**
 * リフレッシュトークンを保存する。
 *
 * 一時ファイルに書いてから rename する。リフレッシュトークンは単発使用で、
 * 保存に失敗した時点で古い値は既に無効化されている（＝再認可以外に復旧手段が無い）ため、
 * 書き込み途中で落ちてファイルが壊れる経路を残せない。
 */
export function saveTokenFile(refreshToken: string): void {
  const path = tokenFilePath();
  mkdirSync(config.canvaStateDir, { recursive: true });
  const body: CanvaTokenFile = { refreshToken, updatedAt: new Date().toISOString() };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`);
  renameSync(tmp, path);
}

function basicAuthHeader(): string {
  const raw = `${config.canvaClientId}:${config.canvaClientSecret}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const response = await axios.post<TokenResponse>(TOKEN_URL, new URLSearchParams(params), {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    validateStatus: () => true,
  });
  if (response.status !== 200) {
    throw new Error(`Canva トークンの取得に失敗しました (HTTP ${response.status}): ${JSON.stringify(response.data)}`);
  }
  return response.data;
}

/**
 * 認可コードをトークンに交換して保存する。初回認可（`npm run canva:login`）から呼ぶ。
 */
export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<void> {
  const token = await requestToken({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: config.canvaRedirectUri,
  });
  saveTokenFile(token.refresh_token);
}

interface CachedAccessToken {
  value: string;
  expiresAt: number;
}

let cached: CachedAccessToken | null = null;
/**
 * 進行中のリフレッシュ。リフレッシュトークンは単発使用なので、
 * 並行して 2 回走ると後の 1 回が必ず失敗し、連携が切れる。1 本に束ねる。
 */
let inFlight: Promise<string> | null = null;

/** テスト用にメモリ上のキャッシュを捨てる。 */
export function resetAccessTokenCache(): void {
  cached = null;
  inFlight = null;
}

async function refreshAccessToken(): Promise<string> {
  const stored = readTokenFile();
  if (!stored) throw new CanvaReauthRequiredError('保存されたリフレッシュトークンがありません');

  let token: TokenResponse;
  try {
    token = await requestToken({ grant_type: 'refresh_token', refresh_token: stored.refreshToken });
  } catch (error) {
    throw new CanvaReauthRequiredError(error instanceof Error ? error.message : String(error));
  }

  // 新しいリフレッシュトークンを保存し切ってからアクセストークンを返す。
  // 先に返すと、保存前に落ちた場合に「使用済みの古い値」だけが残って再認可行きになる。
  saveTokenFile(token.refresh_token);
  cached = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return token.access_token;
}

/**
 * 有効なアクセストークンを返す。期限が近ければ更新する。
 * アクセストークンは 4 時間で切れるだけなので、永続化せずメモリにだけ置く。
 */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cached.value;
  if (inFlight) return inFlight;

  inFlight = refreshAccessToken().finally(() => { inFlight = null; });
  return inFlight;
}
