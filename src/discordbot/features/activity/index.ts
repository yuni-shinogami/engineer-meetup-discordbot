/**
 * 活動の集計の機能が外に見せるもの。
 *
 * features/activity の外からは、このファイルだけを import する（.dependency-cruiser.cjs の features-via-index）。
 */

// --- 入口（index.ts）が登録する。起動したら集計を始める ---

export { activityFeature } from './feature';
