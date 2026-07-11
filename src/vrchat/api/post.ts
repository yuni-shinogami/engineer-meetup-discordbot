import { VRChatClient } from './client';

export async function createGroupPost(
  client: VRChatClient,
  groupId: string,
  title: string,
  text: string,
  visibility = 'group',
  sendNotification = false,
): Promise<Record<string, unknown>> {
  const { http } = client;
  const resp = await http.post(`/groups/${groupId}/posts`, {
    title,
    text,
    visibility,
    sendNotification,
  });

  if (resp.status !== 200 && resp.status !== 201) {
    throw new Error(`Group 投稿失敗 (${resp.status}): ${JSON.stringify(resp.data)}`);
  }

  return resp.data as Record<string, unknown>;
}
