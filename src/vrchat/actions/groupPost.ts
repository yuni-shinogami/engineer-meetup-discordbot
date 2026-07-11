import { join } from 'path';
import { readFileSync } from 'fs';
import { VRChatClient } from '../api/client';
import { createGroupPost } from '../api/post';
import { env } from '../internal/util';
import { GROUP_POST_VISIBILITY, GROUP_POST_SEND_NOTIFICATION } from '../constants';

const ASSETS_DIR = join(__dirname, '../assets');

function readTemplate(filename: string): string {
  return readFileSync(join(ASSETS_DIR, filename), 'utf-8').trim();
}

export async function postToGroup(
  client: VRChatClient,
  options: {
    testMode: boolean;
    groupId?: string;
    title?: string;
    bodyText?: string;
    location?: string;
    instanceId?: string;
    launchUrl?: string;
  },
): Promise<void> {
  const {
    testMode,
    groupId,
    title,
    bodyText,
    location = '',
    instanceId = '',
    launchUrl = '',
  } = options;

  const targetGroupId = testMode ? env('TEST_GROUP_ID') : groupId ?? env('GROUP_ID');
  const targetTitle = title ?? readTemplate('group_post_title.txt');
  const body = bodyText ?? readTemplate('group_post_body.txt')
    .replace('{location}', location)
    .replace('{instance_id}', instanceId)
    .replace('{invite_url}', launchUrl);

  if (testMode) {
    console.log(`[post] テストモード: ${targetGroupId} に投稿`);
  }

  console.log(`Posting to group ${targetGroupId}...`);
  const post = await createGroupPost(client, targetGroupId, targetTitle, body, GROUP_POST_VISIBILITY, GROUP_POST_SEND_NOTIFICATION);
  console.log(`Group post created: id=${(post as Record<string, unknown>).id} group=${targetGroupId}`);
}
