import { REST, Routes } from 'discord.js';
import { config } from '../config';
import type { BotFeature } from '../interactions';

export { createInstanceCommand, handleCreateInstanceCommand } from './create-instance';
export { vrcLinkCommand, handleVrcLinkCommand } from './vrc-link';
export { checkPermissionsCommand, handleCheckPermissionsCommand } from './check-permissions';
export { statusCommand, handleStatusCommand } from './status';

import { createInstanceCommand } from './create-instance';
import { vrcLinkCommand } from './vrc-link';
import { checkPermissionsCommand } from './check-permissions';
import { statusCommand } from './status';

/**
 * スラッシュコマンドを Discord に登録する。
 * features/ の機能のコマンドは、各機能の BotFeature から足す。ここに並べるのは、まだ機能のフォルダーに入っていないコマンド。
 */
export async function registerCommands(features: readonly BotFeature[] = []) {
  const commands = [
    ...features.flatMap(feature => (feature.commands ?? []).map(command => command.definition.toJSON())),
    createInstanceCommand.toJSON(),
    vrcLinkCommand.toJSON(),
    checkPermissionsCommand.toJSON(),
    statusCommand.toJSON(),
  ];
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID || '', config.guildId),
      { body: commands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}
