import dotenv from 'dotenv';
dotenv.config();

function intEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  guildId: process.env.GUILD_ID || '',
  operationsChannelId: process.env.OPERATIONS_CHANNEL_ID || '',
  publicChannelId: process.env.PUBLIC_CHANNEL_ID || '',
  testChannelId: process.env.TEST_CHANNEL_ID || '',
  announceRoleId: process.env.ANNOUNCE_ROLE_ID || '',
  operatorRoleId: process.env.OPERATOR_ROLE_ID || '',
  xAccount: process.env.X_ACCOUNT || '',
  testXAccount: process.env.TEST_X_ACCOUNT || '',
  vrcStateDir: process.env.VRC_STATE_DIR || '',
  storagePath: process.env.STORAGE_PATH || './storage.json',

  // --- LT (ライトニングトーク) ---
  ltForumChannelId: process.env.LT_FORUM_CHANNEL_ID || '',
  testLtForumChannelId: process.env.TEST_LT_FORUM_CHANNEL_ID || '',
  ltStorePath: process.env.LT_STORE_PATH || './lt-store.json',
  ltMaterialsDir: process.env.LT_MATERIALS_DIR || './state/lt-materials',
  /** 集会の開催曜日（0=日 ... 5=金 ... 6=土） */
  meetupWeekday: intEnv('MEETUP_WEEKDAY', 5),
  /** 1回の集会あたりの LT 枠数（原則 1 枠） */
  ltSlotsPerDay: intEnv('LT_SLOTS_PER_DAY', 1),
  /** 日程選択で提示する候補の開催回数 */
  ltDateCandidates: intEnv('LT_DATE_CANDIDATES', 8),
};

export function ltForumChannelId(isProd: boolean): string {
  return isProd ? config.ltForumChannelId : config.testLtForumChannelId;
}
