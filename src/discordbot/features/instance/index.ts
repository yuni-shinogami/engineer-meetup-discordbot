/**
 * VRChat の操作と録画の機能が外に見せるもの。
 *
 * features/instance の外からは、このファイルだけを import する（.dependency-cruiser.cjs の features-via-index）。
 */

// --- 入口（index.ts）がまとめて登録する、インスタンス・招待・録画のコマンドとボタン ---

export { instanceFeature } from './feature';
