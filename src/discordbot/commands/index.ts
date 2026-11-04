import { REST, Routes } from 'discord.js';
import { config } from '../config';

export {
  confirmMeetupCommand,
  handleConfirmMeetupCommand,
  handleConfirmMeetupButton,
  handleLatePreAnnounceButton,
} from './confirm-meetup';
export { ltApplyCommand, handleLtApplyCommand, handleLtApplyModal, LT_APPLY_MODAL } from '../features/lt/index';
export { handleLtDatesSelect, handleLtConsultModal, LT_CONSULT_MODAL } from '../features/lt/index';
export { handleLtVideoSelect } from '../features/lt/index';
export { handleLtEditButton, handleLtEditModal, LT_EDIT_MODAL } from '../features/lt/index';
export { ltMaterialCommand, handleLtMaterialCommand } from '../features/lt/index';
export {
  handleLtAnnounceButton,
  handleLtAnnounceConfirm,
  LT_ANNOUNCE_CONFIRM,
} from '../features/lt/index';
export {
  handleLtScheduleButton,
  handleLtScheduleModal,
  handleLtScheduleSelect,
  handleLtUnscheduleButton,
  LT_SCHEDULE_MODAL,
  LT_SCHEDULE_SELECT,
} from '../features/lt/index';
export { preAnnounceCommand, handlePreAnnounceCommand } from './pre-announce';
export { createInstanceCommand, handleCreateInstanceCommand } from './create-instance';
export { vrcLinkCommand, handleVrcLinkCommand } from './vrc-link';
export { postAnnouncementCommand, handlePostAnnouncementCommand } from './post-announcement';
export { checkPermissionsCommand, handleCheckPermissionsCommand } from './check-permissions';
export { statusCommand, handleStatusCommand } from './status';
export { generateLtImageCommand, handleGenerateLtImageCommand } from '../features/lt/index';
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
import { generateLtImageCommand } from '../features/lt/index';
import { slidesCommand } from './slides';
import { ltApplyCommand } from '../features/lt/index';
import { ltMaterialCommand } from '../features/lt/index';
import { eventCalendarCommand } from './event-calendar';
import { vrcEventCommand } from './vrc-event';
import { discordEventCommand } from './discord-event';

export async function registerCommands() {
  const commands = [
    confirmMeetupCommand.toJSON(),
    ltApplyCommand.toJSON(),
    ltMaterialCommand.toJSON(),
    preAnnounceCommand.toJSON(),
    createInstanceCommand.toJSON(),
    vrcLinkCommand.toJSON(),
    postAnnouncementCommand.toJSON(),
    checkPermissionsCommand.toJSON(),
    statusCommand.toJSON(),
    generateLtImageCommand.toJSON(),
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
