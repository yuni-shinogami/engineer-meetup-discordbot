import { join } from 'path';
import { env } from './internal/util';
import { createClient, VRChatClient } from './api/client';
import { AuthError, login, LoginResult, validateUserAgent } from './api/auth';

export { AuthError };

export interface VRChatSession {
  client: VRChatClient;
  /** ログインしているメインアカウント。フレンド申請の送信元として文面に出す。 */
  user: LoginResult;
}

/**
 * 直列化用のキュー。`/vrc-link` と `/create-instance` が同じ cookie ファイルを共有するため、
 * 同時に走ると書き込みが競合し、不要な再ログインで 429 を踏む。順番に実行させる。
 */
let queue: Promise<unknown> = Promise.resolve();

async function openSession(stateDir: string): Promise<VRChatSession> {
  const userAgent = env('USER_AGENT');
  validateUserAgent(userAgent);

  const username = env('VRC_MAIN_USERNAME');
  const password = env('VRC_MAIN_PASSWORD');
  const totpSecret = env('VRC_MAIN_TOTP_SECRET', { required: false }) || null;

  const client = await createClient(userAgent, join(stateDir, 'cookies.json'));
  const user = await login(client, username, password, totpSecret);
  return { client, user };
}

/**
 * VRChat セッションを取って fn を実行する。セッション自体はキャッシュせず毎回 login を通すが、
 * login は cookie が生きていれば `/auth/user` 1 回で済むので実質的なコストは小さい。
 * 長時間動き続ける bot で cookie 失効に気づけなくなるほうが困る。
 */
export async function withSession<T>(
  stateDir: string,
  fn: (session: VRChatSession) => Promise<T>,
): Promise<T> {
  const run = queue.then(() => openSession(stateDir)).then(fn);
  // 失敗を後続に伝播させないため、キューには握りつぶした Promise を残す
  queue = run.then(() => undefined, () => undefined);
  return run;
}
