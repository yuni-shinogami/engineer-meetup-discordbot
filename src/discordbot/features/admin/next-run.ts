import { CronExpressionParser } from 'cron-parser';

export function formatNextRun(cronExpr: string): string {
  try {
    const next = CronExpressionParser.parse(cronExpr, { tz: 'Asia/Tokyo' }).next().toDate();
    return next.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '(解析失敗)';
  }
}
