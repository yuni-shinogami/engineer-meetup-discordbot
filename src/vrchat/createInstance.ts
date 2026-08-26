import { join } from 'path';
import { env } from './internal/util';
import { saveLatest } from './internal/state';
import { createGroupPlusInstance, inviteSelf } from './api/instance';
import { AuthError } from './api/auth';
import { withSession } from './session';
import { InviteOutcome, InviteTarget, inviteWithFriendCheck } from './actions/invite';

export { AuthError };
export type { InviteOutcome, InviteStatus, InviteTarget } from './actions/invite';

export interface CreateInstanceOptions {
  /** メインアカウント・`VRC_SUB_USER_ID` に加えて招待する相手。 */
  extraInvites?: InviteTarget[];
}

export interface CreateInstanceResult {
  inviteUrl: string;
  /** メインアカウント自身への self-invite を除いた、各招待先の結果。 */
  invites: InviteOutcome[];
}

export async function createInstance(
  isProd: boolean,
  stateDir: string,
  options: CreateInstanceOptions = {},
): Promise<CreateInstanceResult> {
  const worldId = env('WORLD_ID');
  const groupId = env('GROUP_ID');
  const region = env('INSTANCE_REGION', { required: false, default: 'jp' });
  const subUserId = env('VRC_SUB_USER_ID');

  const stateFile = join(stateDir, 'latest.json');

  return withSession(stateDir, async ({ client, user }) => {
    const instance = await createGroupPlusInstance(client, worldId, groupId, region);
    console.log(`[createInstance] created instance: ${instance.location} (short_name: ${instance.shortName})`);

    const launchUrl = `https://vrchat.com/home/launch?worldId=${worldId}&instanceId=${instance.instanceId}`;

    // 招待より先に保存する。招待に失敗しただけでインスタンス情報が残らないと、
    // VRChat 上には立っているのに /post-announcement が「未作成」で落ちる。
    const state = saveLatest(stateFile, {
      worldId,
      instanceId: instance.instanceId,
      location: instance.location,
      launchUrl,
      shortName: instance.shortName,
    });
    console.log(`[createInstance] saved state -> ${stateFile}`);

    try {
      await inviteSelf(client, user.userId, worldId, instance.instanceId);
      console.log('[createInstance] self-invite sent');
    } catch (e) {
      // self-invite が落ちてもインスタンスは使える。招待URLで入れるので続行する。
      console.error('[createInstance] self-invite failed:', e);
    }

    const targets = dedupeTargets(
      [{ userId: subUserId, label: 'サブアカウント' }, ...(options.extraInvites ?? [])],
      user.userId,
    );

    // レートリミットを踏まないよう逐次で送る
    const invites: InviteOutcome[] = [];
    for (const target of targets) {
      invites.push(await inviteWithFriendCheck(client, target, worldId, instance.instanceId));
    }

    return { inviteUrl: state.invite_url, invites };
  });
}

/**
 * 同じ相手へ二重に送らないようにする。ログイン中のメインアカウントは self-invite 済みなので除く
 * （担当者がメインアカウント本人のケースが実際にある）。
 */
function dedupeTargets(targets: InviteTarget[], selfUserId: string): InviteTarget[] {
  const seen = new Set<string>([selfUserId]);
  return targets.filter(target => {
    if (!target.userId || seen.has(target.userId)) return false;
    seen.add(target.userId);
    return true;
  });
}
