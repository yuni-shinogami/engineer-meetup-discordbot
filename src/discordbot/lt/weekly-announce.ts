import { Client } from 'discord.js';
import { config } from '../config';
import {
  ANNOUNCE_TARGETS,
  AnnounceOutcome,
  AnnounceTarget,
  announceLt,
  missingForAnnounce,
} from './announce';
import { formatMeetupDate, upcomingMeetupDates } from './dates';
import { applyLtEntryToPost, fetchLtThread, isProdLtThread } from './forum';
import { ltStore } from './store';
import { LtEntry } from './types';

/**
 * 1 件の登壇に対する週次告知の結果。
 * - announced: 今回の実行で告知を試みた（媒体ごとの成否は outcomes を見る）
 * - blocked: タイトル未定などで告知を見送った
 * - other-forum: 実行モードと違うフォーラムの応募なので対象外（想定どおりの動作）
 * - unreachable: 応募ポストを取得できず、本番/テストの判定ができなかった
 */
export interface WeeklyLtOutcome {
  entry: LtEntry;
  status: 'announced' | 'blocked' | 'other-forum' | 'unreachable';
  outcomes: AnnounceOutcome[];
  missing: string[];
}

export interface WeeklyLtAnnounceResult {
  eventDate: string;
  results: WeeklyLtOutcome[];
}

export interface LtAnnounceRunOptions {
  now?: Date;
  /** 投稿する媒体。前日告知と当日の開催告知でタイミングが違うので呼び出し側が指定する。 */
  targets?: readonly AnnounceTarget[];
}

/** 事前告知の時点から見て次の開催日（木曜に実行すれば翌日の金曜）。 */
export function nextMeetupDate(now: Date = new Date()): string {
  return upcomingMeetupDates(1, now)[0] ?? '';
}

/** その開催日に確定している登壇。取り下げ済みは entriesOnDate が、登壇済みはここで除く。 */
export function ltEntriesForMeetup(eventDate: string): LtEntry[] {
  if (!eventDate) return [];
  return ltStore.entriesOnDate(eventDate)
    .filter(entry => entry.status !== 'done')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 次の開催日に確定している LT の告知をまとめて投稿する。
 *
 * 週次の事前告知とは別投稿で、タイミングだけ揃えている（普段の運用に合わせた形）。
 * 媒体ごとの二重投稿は `announceLt` 側の ref で防いでいるので、
 * 失敗した媒体だけを後からボタンで出し直せる。
 */
export async function announceLtsForMeetup(
  client: Client,
  isProd: boolean,
  { now = new Date(), targets = ANNOUNCE_TARGETS }: LtAnnounceRunOptions = {},
): Promise<WeeklyLtAnnounceResult> {
  const eventDate = nextMeetupDate(now);
  const results: WeeklyLtOutcome[] = [];

  for (const entry of ltEntriesForMeetup(eventDate)) {
    let thread;
    try {
      thread = await fetchLtThread(client, entry.id);
    } catch (error) {
      console.error(`LT 応募ポストを取得できませんでした (${entry.id}):`, error);
      results.push({ entry, status: 'unreachable', outcomes: [], missing: [] });
      continue;
    }

    // 告知済みフラグはレコードに 1 組しか持たないため、テスト実行で本番の応募を
    // 「投稿済み」にしてしまうと木曜の本番投稿が丸ごと飛ぶ。ポストの置き場所で仕分ける。
    // 黙って落とすと「対象ゼロ」と区別が付かないので、対象外だったことは結果に残す。
    if (isProdLtThread(thread) !== isProd) {
      results.push({ entry, status: 'other-forum', outcomes: [], missing: [] });
      continue;
    }

    const missing = missingForAnnounce(entry);
    if (missing.length > 0) {
      results.push({ entry, status: 'blocked', outcomes: [], missing });
      continue;
    }

    const { entry: updated, outcomes } = await announceLt(client, entry, isProd, targets);
    await applyLtEntryToPost(thread, updated, ltStore.slotUsageByDate());
    results.push({ entry: updated, status: 'announced', outcomes, missing: [] });
  }

  return { eventDate, results };
}

/**
 * 運営が手当てすべきこと（失敗・見送り）が残っているか。
 * `other-forum` は仕分けが効いているだけなので手当ては要らない。
 */
export function hasWeeklyLtProblem(result: WeeklyLtAnnounceResult): boolean {
  return result.results.some(r =>
    r.status === 'blocked'
    || r.status === 'unreachable'
    || r.outcomes.some(o => o.status === 'failed'),
  );
}

/** 運営チャンネルへ流す実行結果。予定が無ければ null（通知しない）。 */
export function formatWeeklyLtReport(result: WeeklyLtAnnounceResult): string | null {
  if (result.results.length === 0) return null;

  const lines = [`📣 **${formatMeetupDate(result.eventDate)} の LT 告知**`];

  for (const r of result.results) {
    const head = `<#${r.entry.id}> ${r.entry.speakerName}「${r.entry.title}」`;

    if (r.status === 'unreachable') {
      lines.push(`⚠️ ${head}\n　応募ポストを取得できませんでした。手動で確認してください。`);
      continue;
    }
    if (r.status === 'other-forum') {
      lines.push(`⏭️ ${head}\n　実行モードと違うフォーラムの応募なので対象外です`);
      continue;
    }
    if (r.status === 'blocked') {
      lines.push(`⚠️ ${head}\n　未確定: ${r.missing.join('、')} → 告知を見送りました`);
      continue;
    }
    lines.push(head, ...r.outcomes.map(o => `　${o.message}`));
  }

  if (hasWeeklyLtProblem(result)) {
    lines.push('', '未投稿分はポストの「📣 運営: 告知する」ボタンから出し直せます。');
  }

  return lines.join('\n');
}

export interface WeeklyLtAnnounceOptions extends LtAnnounceRunOptions {
  /**
   * `LT_AUTO_ANNOUNCE=false` でも実行する。
   * 設定は「週次フローに同乗させるか」の切り替えなので、
   * 運営が LT 告知を名指しで指示した場合はそちらを優先する。
   */
  force?: boolean;
}

/**
 * 週次フローに合わせた LT 告知の実行から報告文の組み立てまで。
 * 週次フローを止めないよう、ここで投げられた例外はすべて報告文に畳む。
 */
export async function runWeeklyLtAnnounce(
  client: Client,
  isProd: boolean,
  { force = false, ...runOptions }: WeeklyLtAnnounceOptions = {},
): Promise<string | null> {
  if (!force && !config.ltAutoAnnounce) return null;

  try {
    return formatWeeklyLtReport(await announceLtsForMeetup(client, isProd, runOptions));
  } catch (error) {
    console.error('LT の週次告知に失敗しました:', error);
    const detail = error instanceof Error ? error.message : String(error);
    return `⚠️ LT 告知の自動投稿に失敗しました: ${detail}`;
  }
}
