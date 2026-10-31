import { createClient, VRChatClient } from './api/client';
import { AuthError, currentUser, LoginResult } from './api/auth';

export { AuthError };

export interface VRChatSession {
  client: VRChatClient;
  /** ゲートウェイがログインしているメインアカウント。フレンド申請の送信元として文面に出す。 */
  user: LoginResult;
}

/**
 * vrchat-gateway 経由のクライアントと、ログイン中のアカウントを取って fn を実行する。
 *
 * ログインと cookie はゲートウェイが持ち、VRChat への呼び出しもゲートウェイが順番に流すので、
 * ここで直列化や cookie の保存はしない。毎回 `/auth/user` を通すのは、ゲートウェイがログインできて
 * いないときに AuthError として気づけるようにするため。
 */
export async function withSession<T>(fn: (session: VRChatSession) => Promise<T>): Promise<T> {
  const client = createClient();
  const user = await currentUser(client);
  return fn({ client, user });
}
