import { join } from 'path';
import { readFileSync } from 'fs';
import { env } from './internal/util';
import { createClient } from './api/client';
import { currentUser, AuthError } from './api/auth';
import { postToGroup } from './actions/groupPost';
import { LatestState } from './internal/state';
export { AuthError };

export async function postGroupAnnouncement(isProd: boolean, stateDir: string): Promise<void> {
  const stateFile = join(stateDir, 'latest.json');

  let state: LatestState;
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf-8')) as LatestState;
  } catch {
    throw new Error(`state ファイルが見つかりません: ${stateFile}\n先に /create-instance を実行してください。`);
  }

  const groupId = env('GROUP_ID');

  const client = createClient();
  await currentUser(client);

  await postToGroup(client, {
    testMode: !isProd,
    groupId,
    location: state.location,
    instanceId: state.instance_id,
    launchUrl: state.invite_url,
  });
}
