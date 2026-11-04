import type { BotFeature } from '../../interactions';
import { generateLtImageCommand, handleGenerateLtImageCommand } from './commands/generate-lt-image';
import { handleLtAnnounceButton, handleLtAnnounceConfirm, LT_ANNOUNCE_CONFIRM } from './commands/lt-announce';
import { handleLtApplyCommand, handleLtApplyModal, LT_APPLY_MODAL, ltApplyCommand } from './commands/lt-apply';
import { handleLtConsultModal, handleLtDatesSelect, LT_CONSULT_MODAL } from './commands/lt-dates';
import { handleLtEditButton, handleLtEditModal, LT_EDIT_MODAL } from './commands/lt-edit';
import { handleLtEventCommand, ltEventCommand } from './commands/lt-event';
import { handleLtMaterialCommand, ltMaterialCommand } from './commands/lt-material';
import {
  handleLtScheduleButton,
  handleLtScheduleModal,
  handleLtScheduleSelect,
  handleLtUnscheduleButton,
  LT_SCHEDULE_MODAL,
  LT_SCHEDULE_SELECT,
} from './commands/lt-schedule';
import { handleLtVideoSelect } from './commands/lt-video';
import {
  LT_ANNOUNCE_BUTTON,
  LT_DATES_SELECT,
  LT_EDIT_BUTTON,
  LT_SCHEDULE_BUTTON,
  LT_UNSCHEDULE_BUTTON,
  LT_VIDEO_SELECT,
  logLtForumStatus,
} from './forum';

/**
 * LT のスラッシュコマンドと、フォーラムのポスト内のボタン・モーダル・セレクト。
 * 入口（index.ts）がまとめて登録する。LT のコマンドやボタンを足すときは、ここに並べる。
 */
export const ltFeature: BotFeature = {
  commands: [
    { definition: ltApplyCommand, handle: handleLtApplyCommand },
    { definition: ltMaterialCommand, handle: handleLtMaterialCommand },
    { definition: generateLtImageCommand, handle: handleGenerateLtImageCommand },
    { definition: ltEventCommand, handle: interaction => handleLtEventCommand(interaction) },
  ],
  buttons: {
    [LT_SCHEDULE_BUTTON]: handleLtScheduleButton,
    [LT_UNSCHEDULE_BUTTON]: handleLtUnscheduleButton,
    [LT_EDIT_BUTTON]: handleLtEditButton,
    [LT_ANNOUNCE_BUTTON]: handleLtAnnounceButton,
    [LT_ANNOUNCE_CONFIRM]: handleLtAnnounceConfirm,
  },
  modals: {
    [LT_APPLY_MODAL]: handleLtApplyModal,
    [LT_CONSULT_MODAL]: handleLtConsultModal,
    [LT_EDIT_MODAL]: handleLtEditModal,
    [LT_SCHEDULE_MODAL]: handleLtScheduleModal,
  },
  selects: {
    [LT_DATES_SELECT]: handleLtDatesSelect,
    [LT_SCHEDULE_SELECT]: handleLtScheduleSelect,
    [LT_VIDEO_SELECT]: handleLtVideoSelect,
  },
  // 起動時に LT フォーラムのタグがそろっているかをログに出す
  onReady: logLtForumStatus,
};
