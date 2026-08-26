import { VRChatClient } from '../api/client';
import {
  acceptIncomingFriendRequest,
  getFriendStatus,
  sendFriendRequest,
} from '../api/friends';
import { inviteUser } from '../api/instance';

export interface InviteTarget {
  userId: string;
  /** Discord への報告に使う表示名（「あなた」「サブアカウント」など）。 */
  label: string;
}

export type InviteStatus =
  /** 招待を送れた */
  | 'sent'
  /** 非フレンドだったのでフレンド申請を送った */
  | 'friend-request-sent'
  /** すでに申請済みで、相手の承認待ち */
  | 'pending-approval'
  | 'failed';

export interface InviteOutcome extends InviteTarget {
  status: InviteStatus;
  error?: string;
}

export async function invite(
  client: VRChatClient,
  userId: string,
  worldId: string,
  instanceId: string,
): Promise<void> {
  console.log(`Sending invite to ${userId} for ${worldId}:${instanceId}...`);
  await inviteUser(client, userId, worldId, instanceId);
  console.log(`Successfully sent invite to ${userId}`);
}

/**
 * フレンド関係を確認してから招待する。非フレンドなら招待の代わりにフレンド申請を送る。
 *
 * VRChat の招待はフレンド限定（非フレンドには 403 "You need to be friends with that user first."）。
 * フレンド申請は相手の承認待ちなのでその場では完結しないが、次回以降の招待が通るようになる。
 * 集会のインスタンスは Group+ なので、招待が飛ばなくてもグループメンバーは自力で入れる。
 * したがってここでは例外を投げず、結果を戻り値で報告する。
 */
export async function inviteWithFriendCheck(
  client: VRChatClient,
  target: InviteTarget,
  worldId: string,
  instanceId: string,
): Promise<InviteOutcome> {
  try {
    const status = await getFriendStatus(client, target.userId);

    // 相手から申請が来ているならこちらで承認すればフレンドになれる
    if (!status.isFriend && status.incomingRequest) {
      status.isFriend = await acceptIncomingFriendRequest(client, target.userId);
    }

    if (!status.isFriend) {
      // 送信済みなら送り直さない（API も 400 を返す）
      if (status.outgoingRequest) return { ...target, status: 'pending-approval' };

      const result = await sendFriendRequest(client, target.userId);
      return {
        ...target,
        status: result === 'sent' ? 'friend-request-sent' : 'pending-approval',
      };
    }

    await invite(client, target.userId, worldId, instanceId);
    return { ...target, status: 'sent' };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[invite] ${target.label} (${target.userId}) failed: ${error}`);
    return { ...target, status: 'failed', error };
  }
}
