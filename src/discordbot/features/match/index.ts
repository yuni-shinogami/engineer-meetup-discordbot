/**
 * マッチングの機能が外に見せるもの。
 *
 * features/match の外からは、このファイルだけを import する（.dependency-cruiser.cjs の features-via-index）。
 */

// --- 入口（index.ts）が登録する、マッチングのコマンドとボタン ---

export { matchFeature } from './feature';

// --- 毎週の定期実行（scheduler.ts）の時刻と、そこから呼ぶ処理 ---

export { postTonightButton } from './commands/match';

/** 集会のある週の夜に、公開チャンネルへ「🤝」ボタンを出す時刻 */
export const MATCH_SCHEDULE = {
  label: 'マッチングのボタン',
  expr: process.env.MATCH_CRON ?? '55 21 * * 5',
  description: '開催予定 YES のときのみ、公開チャンネルに「🤝」ボタンを投稿',
} as const;
