import { registerButtonHandler, registerModalHandler, registerSelectHandler } from './interactions';
import { CONFIRM_MEETUP_NO, CONFIRM_MEETUP_YES } from './meetup';
import {
  LT_ANNOUNCE_BUTTON,
  LT_DATES_SELECT,
  LT_EDIT_BUTTON,
  LT_SCHEDULE_BUTTON,
  LT_UNSCHEDULE_BUTTON,
  LT_VIDEO_SELECT,
} from './lt/forum';
import {
  handleConfirmMeetupButton,
  handleLtAnnounceButton,
  handleLtAnnounceConfirm,
  handleLtApplyModal,
  handleLtConsultModal,
  handleLtDatesSelect,
  handleLtEditButton,
  handleLtEditModal,
  handleLtScheduleButton,
  handleLtScheduleModal,
  handleLtScheduleSelect,
  handleLtUnscheduleButton,
  handleLtVideoSelect,
  LT_ANNOUNCE_CONFIRM,
  LT_APPLY_MODAL,
  LT_CONSULT_MODAL,
  LT_EDIT_MODAL,
  LT_SCHEDULE_MODAL,
  LT_SCHEDULE_SELECT,
} from './commands';

/** ボタン・モーダル・セレクトのハンドラを customId のキーに紐づける。起動時に一度だけ呼ぶ。 */
export function registerInteractionHandlers(): void {
  registerButtonHandler(CONFIRM_MEETUP_YES, handleConfirmMeetupButton);
  registerButtonHandler(CONFIRM_MEETUP_NO, handleConfirmMeetupButton);
  registerButtonHandler(LT_SCHEDULE_BUTTON, handleLtScheduleButton);
  registerButtonHandler(LT_UNSCHEDULE_BUTTON, handleLtUnscheduleButton);
  registerButtonHandler(LT_EDIT_BUTTON, handleLtEditButton);
  registerButtonHandler(LT_ANNOUNCE_BUTTON, handleLtAnnounceButton);
  registerButtonHandler(LT_ANNOUNCE_CONFIRM, handleLtAnnounceConfirm);
  registerModalHandler(LT_APPLY_MODAL, handleLtApplyModal);
  registerModalHandler(LT_CONSULT_MODAL, handleLtConsultModal);
  registerModalHandler(LT_EDIT_MODAL, handleLtEditModal);
  registerModalHandler(LT_SCHEDULE_MODAL, handleLtScheduleModal);
  registerSelectHandler(LT_DATES_SELECT, handleLtDatesSelect);
  registerSelectHandler(LT_SCHEDULE_SELECT, handleLtScheduleSelect);
  registerSelectHandler(LT_VIDEO_SELECT, handleLtVideoSelect);
}
