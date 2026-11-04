import { REST, Routes } from 'discord.js';
import { config } from './config';
import type { BotFeature } from './interactions';

/** 各機能の BotFeature のスラッシュコマンドを Discord に登録する。起動時に一度だけ呼ぶ。 */
export async function registerCommands(features: readonly BotFeature[]) {
  const commands = features.flatMap(feature => (feature.commands ?? []).map(command => command.definition.toJSON()));
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
