import { registerButtonHandler, registerModalHandler, registerSelectHandler } from './interactions';
import { CONFIRM_MEETUP_NO, CONFIRM_MEETUP_YES } from './meetup';
import { LT_DATES_SELECT, LT_VIDEO_SELECT } from './lt/forum';
import {
  handleConfirmMeetupButton,
  handleLtApplyModal,
  handleLtConsultModal,
  handleLtDatesSelect,
  handleLtVideoSelect,
  LT_APPLY_MODAL,
  LT_CONSULT_MODAL,
} from './commands';

/** ボタン・モーダル・セレクトのハンドラを customId のキーに紐づける。起動時に一度だけ呼ぶ。 */
export function registerInteractionHandlers(): void {
  registerButtonHandler(CONFIRM_MEETUP_YES, handleConfirmMeetupButton);
  registerButtonHandler(CONFIRM_MEETUP_NO, handleConfirmMeetupButton);
  registerModalHandler(LT_APPLY_MODAL, handleLtApplyModal);
  registerModalHandler(LT_CONSULT_MODAL, handleLtConsultModal);
  registerSelectHandler(LT_DATES_SELECT, handleLtDatesSelect);
  registerSelectHandler(LT_VIDEO_SELECT, handleLtVideoSelect);
}
