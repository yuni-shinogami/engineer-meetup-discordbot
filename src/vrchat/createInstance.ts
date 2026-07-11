import { join } from 'path';
import { env } from './internal/util';
import { saveLatest } from './internal/state';
import { createClient } from './api/client';
import { validateUserAgent, login, AuthError } from './api/auth';
import { createGroupPlusInstance, inviteSelf } from './api/instance';
import { invite } from './actions/invite';

export { AuthError };

export async function createInstance(isProd: boolean, stateDir: string): Promise<string> {
  const userAgent = env('USER_AGENT');
  validateUserAgent(userAgent);

  const username = env('VRC_MAIN_USERNAME');
  const password = env('VRC_MAIN_PASSWORD');
  const totpSecret = env('VRC_MAIN_TOTP_SECRET', { required: false }) || null;
  const worldId = env('WORLD_ID');
  const groupId = env('GROUP_ID');
  const region = env('INSTANCE_REGION', { required: false, default: 'jp' });
  const subUserId = env('VRC_SUB_USER_ID');

  const stateFile = join(stateDir, 'latest.json');
  const cookieFile = join(stateDir, 'cookies.json');

  const client = await createClient(userAgent, cookieFile);
  const { userId: currentUserId } = await login(client, username, password, totpSecret);

  const instance = await createGroupPlusInstance(client, worldId, groupId, region);
  console.log(`[createInstance] created instance: ${instance.location} (short_name: ${instance.shortName})`);

  await inviteSelf(client, currentUserId, worldId, instance.instanceId);
  console.log('[createInstance] self-invite sent');

  await invite(client, subUserId, worldId, instance.instanceId);

  const launchUrl = `https://vrchat.com/home/launch?worldId=${worldId}&instanceId=${instance.instanceId}`;

  const state = saveLatest(stateFile, {
    worldId,
    instanceId: instance.instanceId,
    location: instance.location,
    launchUrl,
    shortName: instance.shortName,
  });
  console.log(`[createInstance] saved state -> ${stateFile}`);

  return state.invite_url;
}
