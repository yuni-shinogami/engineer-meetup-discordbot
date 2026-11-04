/**
 * 開催確認・告知の機能が外に見せるもの。
 *
 * features/meetup の外からは、このファイルだけを import する（.dependency-cruiser.cjs の features-via-index）。
 */

// --- 入口（index.ts）がまとめて登録する、開催確認・告知のコマンドとボタン ---

export { meetupFeature } from './feature';

// --- 毎週の定期実行（scheduler.ts）の時刻と、そこから呼ぶ処理。時刻は /status も表示する ---

export {
  triggerConfirmMeetup,
  triggerPreAnnounce,
} from './weekly';
export { CRON_SCHEDULES } from './schedules';
