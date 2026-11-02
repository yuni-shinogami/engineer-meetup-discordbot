import { registerButtonHandler, registerModalHandler, registerSelectHandler } from './interactions';
import { CONFIRM_MEETUP_NO, CONFIRM_MEETUP_YES, LATE_PRE_ANNOUNCE_BUTTON } from './meetup';
import { handleJoinSubButton, VRC_JOIN_SUB_BUTTON } from './vrc-launcher';
import { handleInviteMeButton, VRC_INVITE_ME_BUTTON } from './vrc-invite';
import {
  handleLtRecordEndButton,
  handleLtRecordMarkButton,
  handleLtRecordStartButton,
  handleRadioPrepButton,
  handleLtRecordStatusButton,
  handleLtRecordStopButton,
  handleLtRecordStopConfirm,
  LT_REC_END_BUTTON,
  LT_REC_MARK_BUTTON,
  LT_REC_START_BUTTON,
  LT_REC_RADIO_BUTTON,
  LT_REC_STATUS_BUTTON,
  LT_REC_STOP_BUTTON,
  LT_REC_STOP_CONFIRM,
} from './lt-recorder';
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
  handleLatePreAnnounceButton,
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
  registerButtonHandler(LATE_PRE_ANNOUNCE_BUTTON, handleLatePreAnnounceButton);
  registerButtonHandler(VRC_JOIN_SUB_BUTTON, handleJoinSubButton);
  registerButtonHandler(VRC_INVITE_ME_BUTTON, handleInviteMeButton);
  registerButtonHandler(LT_REC_START_BUTTON, handleLtRecordStartButton);
  registerButtonHandler(LT_REC_RADIO_BUTTON, handleRadioPrepButton);
  registerButtonHandler(LT_REC_MARK_BUTTON, handleLtRecordMarkButton);
  registerButtonHandler(LT_REC_END_BUTTON, handleLtRecordEndButton);
  registerButtonHandler(LT_REC_STATUS_BUTTON, handleLtRecordStatusButton);
  registerButtonHandler(LT_REC_STOP_BUTTON, handleLtRecordStopButton);
  registerButtonHandler(LT_REC_STOP_CONFIRM, handleLtRecordStopConfirm);
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
