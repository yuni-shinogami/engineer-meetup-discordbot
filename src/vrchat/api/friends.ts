import { VRChatClient } from './client';

export interface FriendStatus {
  isFriend: boolean;
  incomingRequest: boolean;
  outgoingRequest: boolean;
}

/**
 * フレンド関係の確認。
 *
 * インスタンス招待（`POST /invite/{userId}`）は非フレンド相手に 403
 * "You need to be friends with that user first." を返すため、招待の前に必ずこれを見る。
 * 403 のエラー文字列で判定するより堅い。
 */
export async function getFriendStatus(client: VRChatClient, userId: string): Promise<FriendStatus> {
  const { http } = client;
  const resp = await http.get(`/user/${encodeURIComponent(userId)}/friendStatus`);

  if (resp.status !== 200) {
    throw new Error(`フレンド状態の取得失敗 (${resp.status}): ${JSON.stringify(resp.data)}`);
  }

  return {
    isFriend: resp.data?.isFriend === true,
    incomingRequest: resp.data?.incomingRequest === true,
    outgoingRequest: resp.data?.outgoingRequest === true,
  };
}

export type FriendRequestResult = 'sent' | 'already-sent';

/**
 * フレンド申請の送信。
 *
 * VRChat API はフレンド申請にメッセージを添えられない（このエンドポイントは requestBody を持たない）。
 * 「誰からの申請か」は Discord 側の応答文で伝えること。
 *
 * 送信済みの相手には 400 "This user has already been sent a friend request" が返るが、
 * 呼び出し側から見れば「申請済み」という同じ状態なので成功扱いにする。
 */
export async function sendFriendRequest(
  client: VRChatClient,
  userId: string,
): Promise<FriendRequestResult> {
  const { http } = client;
  const resp = await http.post(`/user/${encodeURIComponent(userId)}/friendRequest`);

  if (resp.status === 200) return 'sent';

  const message = String(resp.data?.error?.message ?? resp.data?.error ?? '');
  if (resp.status === 400 && /already been sent/i.test(message)) return 'already-sent';

  throw new Error(`フレンド申請の送信失敗 (${resp.status}): ${JSON.stringify(resp.data)}`);
}

/**
 * 相手から届いているフレンド申請を承認する。承認できたら true。
 *
 * 通知一覧から type=friendRequest のものを探し、その通知 ID（`frq_...`）を accept する。
 * friendStatus の incomingRequest が true でも、通知が既に消えている場合があるので false を返しうる。
 */
export async function acceptIncomingFriendRequest(
  client: VRChatClient,
  userId: string,
): Promise<boolean> {
  const { http } = client;
  const listResp = await http.get('/auth/user/notifications', { params: { type: 'friendRequest' } });

  if (listResp.status !== 200) {
    throw new Error(`通知一覧の取得失敗 (${listResp.status}): ${JSON.stringify(listResp.data)}`);
  }

  const notifications: unknown = listResp.data;
  if (!Array.isArray(notifications)) return false;

  const target = notifications.find(
    (n: { type?: string; senderUserId?: string; id?: string }) =>
      n?.type === 'friendRequest' && n?.senderUserId === userId && typeof n?.id === 'string',
  ) as { id: string } | undefined;
  if (!target) return false;

  const acceptResp = await http.put(
    `/auth/user/notifications/${encodeURIComponent(target.id)}/accept`,
  );
  if (acceptResp.status !== 200) {
    throw new Error(`フレンド申請の承認失敗 (${acceptResp.status}): ${JSON.stringify(acceptResp.data)}`);
  }

  return true;
}
