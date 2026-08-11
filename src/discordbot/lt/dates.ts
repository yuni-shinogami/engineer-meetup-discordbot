import { config } from '../config';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** ローカル日付を 'YYYY-MM-DD' に整形する（レコードの eventDate 形式）。 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' をローカル日付の Date に戻す。不正な文字列なら null。 */
export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  // 2026-02-31 のような繰り上がりを弾く
  return formatDateKey(date) === key ? date : null;
}

/** 'YYYY-MM-DD' を「9/5」形式にする。フォーラムのタイトルなど文字数を切り詰めたい箇所で使う。 */
export function formatShortDate(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 'YYYY-MM-DD' を「9月5日(金)」形式にする。解析できなければ入力をそのまま返す。 */
export function formatMeetupDate(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return `${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAY_LABELS[date.getDay()]})`;
}

/**
 * 直近の集会日から数えて count 回分の開催日を 'YYYY-MM-DD' で返す。
 * from が開催曜日そのものの場合は from 自身を最初の候補に含める。
 */
export function upcomingMeetupDates(
  count: number = config.ltDateCandidates,
  from: Date = new Date(),
  weekday: number = config.meetupWeekday,
): string[] {
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const offset = (weekday - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + offset);

  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}
