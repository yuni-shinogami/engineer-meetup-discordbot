import { randomInt } from 'crypto';
import { formatDateKey } from '../../shared/meetup-dates';
import type { MatchOptin, MatchProfile } from './store';

/** 一度に薦める人数 */
export const RECOMMEND_COUNT = 3;
/** 本人確認のコードの有効時間 */
export const CODE_TTL_MS = 30 * 60 * 1000;
/** 朝 6 時までは前の日の回とみなす（分析の DAY_CUTOFF と同じ） */
const DAY_CUTOFF_HOURS = 6;
/** 読み違えやすい文字（0/O、1/I/L）を除いた文字 */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 今夜の回の日付（YYYY-MM-DD）。日付をまたいでも朝 6 時までは同じ回 */
export function tonightKey(now: Date = new Date()): string {
  return formatDateKey(new Date(now.getTime() - DAY_CUTOFF_HOURS * 60 * 60 * 1000));
}

/** VRChat のステータスか自己紹介に書いてもらう確認コード（例: EM-7F3K2Q） */
export function makeCode(): string {
  let code = 'EM-';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return code;
}

/** ステータスの一言か自己紹介にコードが入っているか。大文字・小文字と前後の空白は気にしない */
export function hasCode(texts: string[], code: string): boolean {
  return texts.some(text => text.toUpperCase().includes(code.toUpperCase()));
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  a.forEach((x, i) => {
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  });
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface Recommendation {
  discordUserId: string;
  displayName: string;
  group: string;
  sharedTags: string[];
  similarity: number;
}

/**
 * 今夜ボタンを押した人（checkedIn）の中から、self に似ている人を似ている順に count 人まで選ぶ。
 * 申し込みが取り消された人と、プロフィールのない人は選ばない
 */
export function recommend(
  self: string,
  checkedIn: string[],
  optins: Record<string, MatchOptin>,
  profiles: Record<string, MatchProfile>,
  count: number = RECOMMEND_COUNT,
): Recommendation[] {
  const me = optins[self];
  const mine = me && profiles[me.vrcUserId];
  if (!me || !mine) return [];
  const results: Recommendation[] = [];
  for (const other of checkedIn) {
    const optin = optins[other];
    if (other === self || !optin || optin.vrcUserId === me.vrcUserId) continue;
    const theirs = profiles[optin.vrcUserId];
    if (!theirs) continue;
    results.push({
      discordUserId: other,
      displayName: optin.displayName,
      group: theirs.group,
      sharedTags: mine.tags.filter(tag => theirs.tags.includes(tag)),
      similarity: cosine(mine.mix, theirs.mix),
    });
  }
  return results
    .sort((a, b) => b.similarity - a.similarity || b.sharedTags.length - a.sharedTags.length)
    .slice(0, count);
}
