import type { BotFeature } from '../../interactions';
import { checkPermissionsCommand, handleCheckPermissionsCommand } from './commands/check-permissions';
import { handleStatusCommand, statusCommand } from './commands/status';

/** 運営向けの確認のコマンド（Bot の設定と今週の状況・チャンネルの権限）。 */
export const adminFeature: BotFeature = {
  commands: [
    { definition: statusCommand, handle: handleStatusCommand },
    { definition: checkPermissionsCommand, handle: handleCheckPermissionsCommand },
  ],
};
