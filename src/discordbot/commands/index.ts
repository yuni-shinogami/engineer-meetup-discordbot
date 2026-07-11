import { REST, Routes } from 'discord.js';
import { config } from '../config';

export { confirmMeetupCommand, handleConfirmMeetupCommand } from './confirm-meetup';
export { preAnnounceCommand, handlePreAnnounceCommand } from './pre-announce';
export { createInstanceCommand, handleCreateInstanceCommand } from './create-instance';
export { postAnnouncementCommand, handlePostAnnouncementCommand } from './post-announcement';
export { checkPermissionsCommand, handleCheckPermissionsCommand } from './check-permissions';
export { statusCommand, handleStatusCommand } from './status';
export { generateLtImageCommand, handleGenerateLtImageCommand } from './generate-lt-image';

import { confirmMeetupCommand } from './confirm-meetup';
import { preAnnounceCommand } from './pre-announce';
import { createInstanceCommand } from './create-instance';
import { postAnnouncementCommand } from './post-announcement';
import { checkPermissionsCommand } from './check-permissions';
import { statusCommand } from './status';
import { generateLtImageCommand } from './generate-lt-image';

export async function registerCommands() {
  const commands = [
    confirmMeetupCommand.toJSON(),
    preAnnounceCommand.toJSON(),
    createInstanceCommand.toJSON(),
    postAnnouncementCommand.toJSON(),
    checkPermissionsCommand.toJSON(),
    statusCommand.toJSON(),
    generateLtImageCommand.toJSON(),
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
