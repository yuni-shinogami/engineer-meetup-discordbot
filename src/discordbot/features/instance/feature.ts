import type { BotFeature } from '../../interactions';
import { createInstanceCommand, handleCreateInstanceCommand } from './commands/create-instance';
import { handleVrcLinkCommand, vrcLinkCommand } from './commands/vrc-link';
import {
  handleLtRecordEndButton,
  handleLtRecordMarkButton,
  handleLtRecordStartButton,
  handleLtRecordStatusButton,
  handleLtRecordStopButton,
  handleLtRecordStopConfirm,
  handleRadioPrepButton,
  LT_REC_END_BUTTON,
  LT_REC_MARK_BUTTON,
  LT_REC_RADIO_BUTTON,
  LT_REC_START_BUTTON,
  LT_REC_STATUS_BUTTON,
  LT_REC_STOP_BUTTON,
  LT_REC_STOP_CONFIRM,
} from './lt-recorder';
import { handleInviteMeButton, VRC_INVITE_ME_BUTTON } from './vrc-invite';
import { handleJoinSubButton, VRC_JOIN_SUB_BUTTON } from './vrc-launcher';

/**
 * VRChat のインスタンス作成・招待・アカウント登録と、/create-instance の結果に付くボタン
 * （サブアカウントで入る・自分に招待・LT 録画・ラジオ準備）。
 */
export const instanceFeature: BotFeature = {
  commands: [
    { definition: createInstanceCommand, handle: handleCreateInstanceCommand },
    { definition: vrcLinkCommand, handle: handleVrcLinkCommand },
  ],
  buttons: {
    [VRC_JOIN_SUB_BUTTON]: handleJoinSubButton,
    [VRC_INVITE_ME_BUTTON]: handleInviteMeButton,
    [LT_REC_START_BUTTON]: handleLtRecordStartButton,
    [LT_REC_RADIO_BUTTON]: handleRadioPrepButton,
    [LT_REC_MARK_BUTTON]: handleLtRecordMarkButton,
    [LT_REC_END_BUTTON]: handleLtRecordEndButton,
    [LT_REC_STATUS_BUTTON]: handleLtRecordStatusButton,
    [LT_REC_STOP_BUTTON]: handleLtRecordStopButton,
    [LT_REC_STOP_CONFIRM]: handleLtRecordStopConfirm,
  },
};
