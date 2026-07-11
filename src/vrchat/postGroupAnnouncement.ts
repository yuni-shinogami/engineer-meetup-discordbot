import { join } from 'path';
import { readFileSync } from 'fs';
import { env } from './internal/util';
import { createClient } from './api/client';
import { validateUserAgent, login, AuthError } from './api/auth';
import { postToGroup } from './actions/groupPost';
import { LatestState } from './internal/state';
export { AuthError };

export async function postGroupAnnouncement(isProd: boolean, stateDir: string): Promise<void> {
  const stateFile = join(stateDir, 'latest.json');
  const cookieFile = join(stateDir, 'cookies.json');

  let state: LatestState;
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf-8')) as LatestState;
  } catch {
    throw new Error(`state ファイルが見つかりません: ${stateFile}\n先に /create-instance を実行してください。`);
  }

  const userAgent = env('USER_AGENT');
  validateUserAgent(userAgent);

  const username = env('VRC_MAIN_USERNAME');
  const password = env('VRC_MAIN_PASSWORD');
  const totpSecret = env('VRC_MAIN_TOTP_SECRET', { required: false }) || null;
  const groupId = env('GROUP_ID');

  const client = await createClient(userAgent, cookieFile);
  await login(client, username, password, totpSecret);

  await postToGroup(client, {
    testMode: !isProd,
    groupId,
    location: state.location,
    instanceId: state.instance_id,
    launchUrl: state.invite_url,
  });
}
