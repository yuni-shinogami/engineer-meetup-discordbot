import type { BotFeature } from '../../interactions';
import { startActivityCollector } from './collector';

/**
 * Discord の活動（メッセージ・リアクション・VC・参加と退出）の集計。コマンドは無く、起動したら集計を始める。
 * 過去のメッセージの取り込みは npm run activity:backfill（backfill.ts）。
 */
export const activityFeature: BotFeature = {
  onReady: async client => startActivityCollector(client),
};
