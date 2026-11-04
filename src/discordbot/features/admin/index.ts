/**
 * 運営向けの確認の機能が外に見せるもの。
 *
 * features/admin の外からは、このファイルだけを import する（.dependency-cruiser.cjs の features-via-index）。
 */

// --- 入口（index.ts）がまとめて登録する、確認のコマンド ---

export { adminFeature } from './feature';
