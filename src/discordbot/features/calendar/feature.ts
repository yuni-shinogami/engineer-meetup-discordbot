import type { BotFeature } from '../../interactions';
import { discordEventCommand, handleDiscordEventCommand } from './commands/discord-event';
import { eventCalendarCommand, handleEventCalendarCommand } from './commands/event-calendar';
import { handleVrcEventCommand, vrcEventCommand } from './commands/vrc-event';

/**
 * イベント登録（VRChat イベントカレンダー・VRChat のグループのイベント・Discord のイベント）を手で操作するコマンド。
 * 開催確認の YES/NO からの自動登録は、index.ts の register* / delete* を開催確認が呼ぶ。
 */
export const calendarFeature: BotFeature = {
  commands: [
    { definition: eventCalendarCommand, handle: handleEventCalendarCommand },
    { definition: vrcEventCommand, handle: handleVrcEventCommand },
    { definition: discordEventCommand, handle: handleDiscordEventCommand },
  ],
};
