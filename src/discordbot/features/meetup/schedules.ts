/**
 * 毎週の定期実行の時刻（cron 式）。scheduler.ts が登録し、/status が次回の時刻を表示する。
 */
export const CRON_SCHEDULES = [
  {
    label: '開催確認',
    expr: process.env.CONFIRM_CRON ?? '0 12 * * 1',
    description: '運営チャンネルに YES/NO ボタンを送信',
  },
  {
    label: '事前告知',
    expr: process.env.PRE_ANNOUNCE_CRON ?? '0 19 * * 4',
    description: '開催予定 YES のときのみ実行（翌日の LT 告知も同時に投稿）',
  },
] as const;
