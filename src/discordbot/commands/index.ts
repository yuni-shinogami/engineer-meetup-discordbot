import { REST, Routes } from 'discord.js';
import { config } from '../config';
import type { BotFeature } from '../interactions';

export {
  confirmMeetupCommand,
  handleConfirmMeetupCommand,
  handleConfirmMeetupButton,
  handleLatePreAnnounceButton,
} from './confirm-meetup';
export { preAnnounceCommand, handlePreAnnounceCommand } from './pre-announce';
export { createInstanceCommand, handleCreateInstanceCommand } from './create-instance';
export { vrcLinkCommand, handleVrcLinkCommand } from './vrc-link';
export { postAnnouncementCommand, handlePostAnnouncementCommand } from './post-announcement';
export { checkPermissionsCommand, handleCheckPermissionsCommand } from './check-permissions';
export { statusCommand, handleStatusCommand } from './status';
export { slidesCommand, handleSlidesCommand } from './slides';
export { eventCalendarCommand, handleEventCalendarCommand } from './event-calendar';
export { vrcEventCommand, handleVrcEventCommand } from './vrc-event';
export { discordEventCommand, handleDiscordEventCommand } from './discord-event';

import { confirmMeetupCommand } from './confirm-meetup';
import { preAnnounceCommand } from './pre-announce';
import { createInstanceCommand } from './create-instance';
import { vrcLinkCommand } from './vrc-link';
import { postAnnouncementCommand } from './post-announcement';
import { checkPermissionsCommand } from './check-permissions';
import { statusCommand } from './status';
import { slidesCommand } from './slides';
import { eventCalendarCommand } from './event-calendar';
import { vrcEventCommand } from './vrc-event';
import { discordEventCommand } from './discord-event';

/**
 * スラッシュコマンドを Discord に登録する。
 * features/ の機能のコマンドは、各機能の BotFeature から足す。ここに並べるのは、まだ機能のフォルダーに入っていないコマンド。
 */
export async function registerCommands(features: readonly BotFeature[] = []) {
  const commands = [
    ...features.flatMap(feature => (feature.commands ?? []).map(command => command.definition.toJSON())),
    confirmMeetupCommand.toJSON(),
    preAnnounceCommand.toJSON(),
    createInstanceCommand.toJSON(),
    vrcLinkCommand.toJSON(),
    postAnnouncementCommand.toJSON(),
    checkPermissionsCommand.toJSON(),
    statusCommand.toJSON(),
    slidesCommand.toJSON(),
    eventCalendarCommand.toJSON(),
    vrcEventCommand.toJSON(),
    discordEventCommand.toJSON(),
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
