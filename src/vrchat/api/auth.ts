import { VRChatClient } from './client';

export class AuthError extends Error {}

export interface LoginResult {
  userId: string;
  displayName: string;
}

/**
 * ゲートウェイがログインしているメインアカウント（慕狼ゆに）。
 *
 * ログインそのものはゲートウェイが持つ。ここでは `/auth/user` を 1 回呼び、
 * ゲートウェイが VRChat にログインできない・Bot を断ったときに AuthError にして、
 * 各コマンドの「VRChat 認証エラー」として出せるようにする。
 */
export async function currentUser(client: VRChatClient): Promise<LoginResult> {
  const resp = await client.http.get('/auth/user');

  if (resp.status === 200 && resp.data?.id) {
    return { userId: resp.data.id, displayName: resp.data.displayName };
  }

  if (resp.status === 503 && resp.data?.error === 'login_failed') {
    throw new AuthError(`vrchat-gateway が VRChat にログインできません: ${resp.data.message ?? ''}`);
  }

  if (resp.status === 403 && resp.data?.error === 'forbidden') {
    throw new AuthError(
      'vrchat-gateway に断られました。VRC_GATEWAY_TOKEN と、ゲートウェイの clients.json を確認してください。',
    );
  }

  throw new AuthError(`ログイン中のアカウントを取得できません (${resp.status}): ${JSON.stringify(resp.data)}`);
}
