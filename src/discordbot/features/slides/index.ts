/**
 * 司会進行スライドの機能が外に見せるもの。
 *
 * features/slides の外からは、このファイルだけを import する（.dependency-cruiser.cjs の features-via-index）。
 */

// --- 入口（index.ts）がまとめて登録する、スライドのコマンド ---

export { slidesFeature } from './feature';

// --- 開催確認の YES から、その週のスライドを投稿する ---

export {
  postSlidesToChannel,
} from './slides';
