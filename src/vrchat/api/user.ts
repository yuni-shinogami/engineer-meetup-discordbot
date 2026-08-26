import { VRChatClient } from './client';

export interface VRChatUser {
  id: string;
  displayName: string;
}

/**
 * ユーザーの存在確認と表示名の取得。
 *
 * ユーザーIDの形式はアプリ側では厳密に検証しない（レガシーアカウントは `usr_` プレフィックスを持たず
 * `8JoV9XEdpo` のような短い ID になる）。正誤の判定はこの API に任せ、404 は「存在しない」として
 * null を返す。
 */
export async function getUser(client: VRChatClient, userId: string): Promise<VRChatUser | null> {
  const { http } = client;
  const resp = await http.get(`/users/${encodeURIComponent(userId)}`);

  if (resp.status === 404) return null;
  if (resp.status !== 200) {
    throw new Error(`ユーザー取得失敗 (${resp.status}): ${JSON.stringify(resp.data)}`);
  }

  const data = resp.data;
  if (!data?.id) {
    throw new Error(`ユーザー取得の応答が不正です: ${JSON.stringify(data)}`);
  }

  return { id: data.id, displayName: data.displayName ?? data.id };
}
