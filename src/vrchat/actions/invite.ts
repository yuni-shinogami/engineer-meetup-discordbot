import { VRChatClient } from '../api/client';
import { inviteUser } from '../api/instance';

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
