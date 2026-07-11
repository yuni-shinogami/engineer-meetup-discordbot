import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface LatestState {
  world_id: string;
  instance_id: string;
  location: string;
  launch_uri: string;
  launch_url: string;
  invite_url: string;
  short_name: string | null;
  created_at: string;
}

export function saveLatest(
  stateFile: string,
  params: {
    worldId: string;
    instanceId: string;
    location: string;
    launchUrl: string;
    shortName?: string | null;
  },
): LatestState {
  const { worldId, instanceId, location, launchUrl, shortName = null } = params;
  const state: LatestState = {
    world_id: worldId,
    instance_id: instanceId,
    location,
    launch_uri: `vrchat://launch?id=${location}`,
    launch_url: launchUrl,
    invite_url: shortName ? `https://vrchat.com/i/${shortName}` : launchUrl,
    short_name: shortName,
    created_at: new Date().toISOString(),
  };
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
  return state;
}
