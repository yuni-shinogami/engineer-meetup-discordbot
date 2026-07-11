import { VRChatClient } from './client';

export interface InstanceInfo {
  location: string;
  instanceId: string;
  shortName: string | null;
}

export async function createGroupPlusInstance(
  client: VRChatClient,
  worldId: string,
  groupId: string,
  region = 'jp',
): Promise<InstanceInfo> {
  const { http } = client;
  const resp = await http.post('/instances', {
    worldId,
    type: 'group',
    region,
    ownerId: groupId,
    groupAccessType: 'plus',
    queueEnabled: false,
  });

  if (resp.status !== 200) {
    throw new Error(`インスタンス作成失敗 (${resp.status}): ${JSON.stringify(resp.data)}`);
  }

  const data = resp.data;
  const location: string = data.location ?? data.id;
  const instanceId: string = data.instanceId ?? location.split(':')[1]?.split('~')[0] ?? '';
  const shortName: string | null = data.shortName ?? null;

  return { location, instanceId, shortName };
}

export async function inviteSelf(
  client: VRChatClient,
  _currentUserId: string,
  worldId: string,
  instanceId: string,
): Promise<void> {
  const { http } = client;
  const resp = await http.post(`/invite/myself/to/${worldId}:${instanceId}`);
  if (resp.status !== 200) {
    throw new Error(`self-invite 失敗 (${resp.status}): ${JSON.stringify(resp.data)}`);
  }
}

export async function inviteUser(
  client: VRChatClient,
  userId: string,
  worldId: string,
  instanceId: string,
): Promise<void> {
  const { http } = client;
  const resp = await http.post(`/invite/${userId}`, {
    instanceId: `${worldId}:${instanceId}`,
  });
  if (resp.status !== 200) {
    throw new Error(`${userId} への招待失敗 (${resp.status}): ${JSON.stringify(resp.data)}`);
  }
}
