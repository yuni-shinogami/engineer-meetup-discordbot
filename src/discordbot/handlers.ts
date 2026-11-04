import { registerButtonHandler } from './interactions';
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

/**
 * まだ機能のフォルダー（features/）に入っていないボタンのハンドラを customId のキーに紐づける。起動時に一度だけ呼ぶ。
 * features/ の機能のボタン・モーダル・セレクトは、各機能の BotFeature から登録する（index.ts）。
 */
export function registerInteractionHandlers(): void {
  registerButtonHandler(VRC_JOIN_SUB_BUTTON, handleJoinSubButton);
  registerButtonHandler(VRC_INVITE_ME_BUTTON, handleInviteMeButton);
  registerButtonHandler(LT_REC_START_BUTTON, handleLtRecordStartButton);
  registerButtonHandler(LT_REC_RADIO_BUTTON, handleRadioPrepButton);
  registerButtonHandler(LT_REC_MARK_BUTTON, handleLtRecordMarkButton);
  registerButtonHandler(LT_REC_END_BUTTON, handleLtRecordEndButton);
  registerButtonHandler(LT_REC_STATUS_BUTTON, handleLtRecordStatusButton);
  registerButtonHandler(LT_REC_STOP_BUTTON, handleLtRecordStopButton);
  registerButtonHandler(LT_REC_STOP_CONFIRM, handleLtRecordStopConfirm);
}
