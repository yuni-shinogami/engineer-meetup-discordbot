/**
 * イベント登録の機能が外に見せるもの。
 *
 * features/calendar の外からは、このファイルだけを import する（.dependency-cruiser.cjs の features-via-index）。
 * 外で使うものを足すときはここに export を足す。ここに無いものはイベント登録の中だけで使っている。
 */

// --- 入口（index.ts）がまとめて登録する、イベント登録のコマンド ---

export { calendarFeature } from './feature';

// --- 開催確認の YES/NO から、その週の集会を登録・削除する ---

export {
  deleteFromVrceve,
  registerOnVrceve,
} from './vrceve';
export {
  deleteVrcEvent,
  registerVrcEvent,
} from './vrc-event';
export {
  deleteDiscordEvent,
  registerDiscordEvent,
} from './discord-event';
