import dotenv from 'dotenv';
dotenv.config();

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
};
