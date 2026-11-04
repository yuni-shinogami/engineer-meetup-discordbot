/**
 * LT（応募から告知まで）の機能が外に見せるもの。
 *
 * features/lt の外からは、このファイルだけを import する（.dependency-cruiser.cjs の features-via-index）。
 * 外で使うものを足すときはここに export を足す。ここに無いものは LT の中だけで使っている。
 */

// --- 入口（index.ts・handlers.ts・commands/index.ts）で登録するコマンドとボタン ---

export {
  generateLtImageCommand,
  handleGenerateLtImageCommand,
} from './commands/generate-lt-image';
export {
  LT_ANNOUNCE_CONFIRM,
  handleLtAnnounceButton,
  handleLtAnnounceConfirm,
} from './commands/lt-announce';
export {
  LT_APPLY_MODAL,
  handleLtApplyCommand,
  handleLtApplyModal,
  ltApplyCommand,
} from './commands/lt-apply';
export {
  LT_CONSULT_MODAL,
  handleLtConsultModal,
  handleLtDatesSelect,
} from './commands/lt-dates';
export {
  LT_EDIT_MODAL,
  handleLtEditButton,
  handleLtEditModal,
} from './commands/lt-edit';
export {
  handleLtMaterialCommand,
  ltMaterialCommand,
} from './commands/lt-material';
export {
  LT_SCHEDULE_MODAL,
  LT_SCHEDULE_SELECT,
  handleLtScheduleButton,
  handleLtScheduleModal,
  handleLtScheduleSelect,
  handleLtUnscheduleButton,
} from './commands/lt-schedule';
export {
  handleLtVideoSelect,
} from './commands/lt-video';
export {
  LT_ANNOUNCE_BUTTON,
  LT_DATES_SELECT,
  LT_EDIT_BUTTON,
  LT_SCHEDULE_BUTTON,
  LT_UNSCHEDULE_BUTTON,
  LT_VIDEO_SELECT,
  logLtForumStatus,
} from './forum';

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
