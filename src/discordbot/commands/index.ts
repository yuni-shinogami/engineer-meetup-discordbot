import { REST, Routes } from 'discord.js';
import { config } from '../config';

export { confirmMeetupCommand, handleConfirmMeetupCommand, handleConfirmMeetupButton } from './confirm-meetup';
export { ltApplyCommand, handleLtApplyCommand, handleLtApplyModal, LT_APPLY_MODAL } from './lt-apply';
export { handleLtDatesSelect, handleLtConsultModal, LT_CONSULT_MODAL } from './lt-dates';
export { handleLtVideoSelect } from './lt-video';
export { handleLtEditButton, handleLtEditModal, LT_EDIT_MODAL } from './lt-edit';
export { ltMaterialCommand, handleLtMaterialCommand } from './lt-material';
export {
  handleLtAnnounceButton,
  handleLtAnnounceConfirm,
  LT_ANNOUNCE_CONFIRM,
} from './lt-announce';
export {
  handleLtScheduleButton,
  handleLtScheduleModal,
  handleLtScheduleSelect,
  handleLtUnscheduleButton,
  LT_SCHEDULE_MODAL,
  LT_SCHEDULE_SELECT,
} from './lt-schedule';
export { preAnnounceCommand, handlePreAnnounceCommand } from './pre-announce';
export { createInstanceCommand, handleCreateInstanceCommand } from './create-instance';
export { vrcLinkCommand, handleVrcLinkCommand } from './vrc-link';
export { postAnnouncementCommand, handlePostAnnouncementCommand } from './post-announcement';
export { checkPermissionsCommand, handleCheckPermissionsCommand } from './check-permissions';
export { statusCommand, handleStatusCommand } from './status';
export { generateLtImageCommand, handleGenerateLtImageCommand } from './generate-lt-image';
export { slidesCommand, handleSlidesCommand } from './slides';

import { confirmMeetupCommand } from './confirm-meetup';
import { preAnnounceCommand } from './pre-announce';
import { createInstanceCommand } from './create-instance';
import { vrcLinkCommand } from './vrc-link';
import { postAnnouncementCommand } from './post-announcement';
import { checkPermissionsCommand } from './check-permissions';
import { statusCommand } from './status';
import { generateLtImageCommand } from './generate-lt-image';
import { slidesCommand } from './slides';
import { ltApplyCommand } from './lt-apply';
import { ltMaterialCommand } from './lt-material';

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
