/**
 * LT（応募から告知まで）の機能が外に見せるもの。
 *
 * features/lt の外からは、このファイルだけを import する（.dependency-cruiser.cjs の features-via-index）。
 * 外で使うものを足すときはここに export を足す。ここに無いものは LT の中だけで使っている。
 */

// --- 入口（index.ts）がまとめて登録する、LT のコマンドとボタン・モーダル・セレクト ---

export { ltFeature } from './feature';

// --- 週の告知（事前告知・開催告知）に LT を載せる ---

export {
  MEETUP_DAY_TARGETS,
  PRE_ANNOUNCE_TARGETS,
} from './announce';
export {
  ltEntriesForMeetup,
  nextMeetupDate,
  runWeeklyLtAnnounce,
} from './weekly-announce';

// --- LT の記録（イベント登録・録画・/status から読む） ---

export {
  ltStore,
} from './store';
export {
  ARCHIVE_POLICY_SHORT,
  LT_STATUSES,
  needsTitle,
} from './types';
export type { ArchivePolicy, LtEntry } from './types';
export {
  LT_STATUS_LABELS,
  resolveLtTags,
} from './status';
export {
  fetchLtForum,
} from './forum';

// --- LT 会（/status から読む） ---

export { upcomingLtEvents } from './events';
export { describeLtEventStatus } from './commands/lt-event';
