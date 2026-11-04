import fs from 'fs';
import path from 'path';
import { config } from '../../config';
import { formatDateKey, formatMeetupDate, parseDateKey, upcomingMeetupDates } from '../../shared/meetup-dates';

/**
 * LT 会。毎週の集会とは別の日に開く、複数人が登壇する独立したイベント。
 *
 * 応募（LtEntry）とは開催日で紐づける。LT 会の日に確定した応募がその LT 会の登壇で、
 * 枠数は LT_SLOTS_PER_DAY ではなく LT 会の slots で数える。
 * 毎週の集会の日に開くこともでき、その日は毎週の 1 枠の代わりに LT 会の枠数になる。
 * 1 つの日付に開けるのは、本番・テストそれぞれ 1 つまで。
 */
export interface LtEvent {
  /** 開催日 'YYYY-MM-DD'。本番・テストごとの主キー */
  date: string;
  /** 本番の LT 会か。応募と同じく、テストの LT 会が本番の候補日に出ないよう分ける */
  isProd: boolean;
  /** 開始・終了時刻 'HH:MM' */
  startTime: string;
  endTime: string;
  /** 登壇の枠数 */
  slots: number;
  /** テーマ。運営が決めて入力する */
  theme: string;
  /** 応募の締切 'YYYY-MM-DD'。この日まで登壇者の候補日に出す */
  applyDeadline: string;
  /** 取りやめたか。記録は消さずに残す（その日に確定していた応募を追えるように） */
  cancelled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LtEventInput = Pick<LtEvent, 'date' | 'isProd' | 'startTime' | 'endTime' | 'slots' | 'theme' | 'applyDeadline'>;

/** /lt-event edit で変えられる項目。日付は変えられない（取りやめて作り直す） */
export type LtEventPatch = Partial<Pick<LtEvent, 'startTime' | 'endTime' | 'slots' | 'theme' | 'applyDeadline'>>;

/** 1 つの LT 会に置ける枠数の上限。セレクトの選択肢（25 個）に収まり、1 回の LT 会として現実的な数 */
export const MAX_LT_EVENT_SLOTS = 20;

/** 希望日のセレクトに出す LT 会の数の上限。毎週の候補日と「この中に登壇できる日がない」を足して 25 個に収める */
const MAX_LT_EVENT_CANDIDATES = 8;

interface LtEventStoreData {
  events: LtEvent[];
}

/**
 * LT 会の記録の永続化。応募（lt-store.json）とは別のファイルに持つ。
 * 応募のストアと同じく、tmp への書き出し → rename で原子的に差し替える。
 */
export class LtEventStore {
  private data: LtEventStoreData;

  constructor(private readonly storePath: string = config.ltEventStorePath) {
    this.data = this.load();
  }

  private load(): LtEventStoreData {
    if (!fs.existsSync(this.storePath)) return { events: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as Partial<LtEventStoreData>;
      return { events: Array.isArray(parsed.events) ? parsed.events : [] };
    } catch (e) {
      console.error('Failed to load LT event store:', e);
      return { events: [] };
    }
  }

  private save(): void {
    const dir = path.dirname(this.storePath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.storePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.storePath);
  }

  /** その応募先の LT 会を日付順に返す。取りやめたものも含む。 */
  list(isProd: boolean): LtEvent[] {
    return this.data.events
      .filter(event => event.isProd === isProd)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  get(date: string, isProd: boolean): LtEvent | undefined {
    return this.data.events.find(event => event.date === date && event.isProd === isProd);
  }

  create(input: LtEventInput, now: string = new Date().toISOString()): LtEvent {
    if (this.get(input.date, input.isProd)) {
      throw new Error(`${formatMeetupDate(input.date)} の LT 会は既にあります`);
    }
    const event: LtEvent = { ...input, cancelled: false, createdAt: now, updatedAt: now };
    this.data.events.push(event);
    this.save();
    return event;
  }

  update(date: string, isProd: boolean, patch: LtEventPatch | Pick<LtEvent, 'cancelled'>): LtEvent {
    const index = this.data.events.findIndex(event => event.date === date && event.isProd === isProd);
    const current = this.data.events[index];
    if (index === -1 || !current) {
      throw new Error(`${formatMeetupDate(date)} の LT 会が見つかりません`);
    }
    const updated: LtEvent = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.data.events[index] = updated;
    this.save();
    return updated;
  }
}

export const ltEventStore = new LtEventStore();

/** その日に開く LT 会（取りやめたものは除く）。 */
export function ltEventOn(date: string, isProd: boolean, store: LtEventStore = ltEventStore): LtEvent | undefined {
  const event = store.get(date, isProd);
  return event && !event.cancelled ? event : undefined;
}

/** その日の登壇の枠数。LT 会の日はその LT 会の枠数、ほかの日は毎週の集会の枠数（LT_SLOTS_PER_DAY）。 */
export function slotsOn(date: string, isProd: boolean, store: LtEventStore = ltEventStore): number {
  return ltEventOn(date, isProd, store)?.slots ?? config.ltSlotsPerDay;
}

/** これから開く LT 会（取りやめたものと、開催日を過ぎたものは除く）。 */
export function upcomingLtEvents(isProd: boolean, now: Date = new Date(), store: LtEventStore = ltEventStore): LtEvent[] {
  const today = formatDateKey(now);
  return store.list(isProd).filter(event => !event.cancelled && event.date >= today);
}

/**
 * 登壇者が選べる候補日。毎週の集会の候補日に、応募を受け付けている LT 会の日を足して日付順に並べる。
 * 応募の締切を過ぎた LT 会は出さない。
 */
export function applicantDateCandidates(isProd: boolean, now: Date = new Date(), store: LtEventStore = ltEventStore): string[] {
  const today = formatDateKey(now);
  const events = upcomingLtEvents(isProd, now, store)
    .filter(event => event.applyDeadline >= today)
    .slice(0, MAX_LT_EVENT_CANDIDATES)
    .map(event => event.date);
  return mergeDates(upcomingMeetupDates(config.ltDateCandidates, now), events);
}

/**
 * 運営が日程を確定するときの候補日。毎週の集会の候補日に、これから開く LT 会の日を足す。
 * 締切を過ぎても運営は LT 会に入れられる（締切後の調整や差し替えのため）。
 */
export function operatorDateCandidates(isProd: boolean, now: Date = new Date(), store: LtEventStore = ltEventStore): string[] {
  const events = upcomingLtEvents(isProd, now, store).slice(0, MAX_LT_EVENT_CANDIDATES).map(event => event.date);
  return mergeDates(upcomingMeetupDates(config.ltDateCandidates, now), events);
}

function mergeDates(weekly: readonly string[], events: readonly string[]): string[] {
  return [...new Set([...weekly, ...events])].sort();
}

/** セレクトの選択肢に付ける日付の表示。LT 会の日は分かるように印を付ける。 */
export function dateOptionLabel(date: string, isProd: boolean, store: LtEventStore = ltEventStore): string {
  return ltEventOn(date, isProd, store) ? `${formatMeetupDate(date)} 🎤LT会` : formatMeetupDate(date);
}

/** LT 会の 1 行の説明。「11月20日(金) 21:00〜23:00「テーマ」 枠 5（締切 11月13日(金)）」 */
export function describeLtEvent(event: LtEvent): string {
  return `${formatMeetupDate(event.date)} ${event.startTime}〜${event.endTime}「${event.theme}」`
    + ` 枠 ${event.slots}（応募締切 ${formatMeetupDate(event.applyDeadline)}）`;
}

/** 'HH:MM'（0:00〜23:59）か。全角数字や「21時」は受けず、/lt-event の入力で弾いて書き直してもらう */
export function isTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export interface ValidateLtEventOptions {
  now?: Date;
  /** その日に既に確定している応募の数。枠数をそれより減らせない */
  used?: number;
  /**
   * 開催日が過去でないかを確かめるか。
   * 作るときだけ確かめる。日付は変えられないので、作ったあとの変更（当日の調整を含む）では確かめない
   */
  checkDate?: boolean;
}

/** LT 会の内容を確かめて、問題があれば理由を返す。 */
export function validateLtEvent(
  event: LtEventInput,
  { now = new Date(), used = 0, checkDate = true }: ValidateLtEventOptions = {},
): string[] {
  const errors: string[] = [];
  const date = parseDateKey(event.date);
  if (!date) {
    errors.push('開催日は YYYY-MM-DD の形で入力してください（例: 2026-11-21）。');
  } else if (checkDate && event.date < formatDateKey(now)) {
    errors.push('開催日が過去の日付です。');
  }
  if (!isTimeOfDay(event.startTime) || !isTimeOfDay(event.endTime)) {
    errors.push('開始・終了時刻は HH:MM の形で入力してください（例: 21:00）。');
  } else if (event.startTime >= event.endTime) {
    errors.push('終了時刻は開始時刻より後にしてください。');
  }
  if (!Number.isInteger(event.slots) || event.slots < 1 || event.slots > MAX_LT_EVENT_SLOTS) {
    errors.push(`枠数は 1〜${MAX_LT_EVENT_SLOTS} にしてください。`);
  } else if (event.slots < used) {
    errors.push(`すでに ${used} 人の登壇が確定しているので、枠数を ${used} より少なくできません。`);
  }
  if (event.theme.trim() === '') errors.push('テーマを入力してください。');
  if (!parseDateKey(event.applyDeadline)) {
    errors.push('応募締切は YYYY-MM-DD の形で入力してください（例: 2026-11-14）。');
  } else if (date && event.applyDeadline > event.date) {
    errors.push('応募締切は開催日より前にしてください。');
  }
  return errors;
}

/**
 * 作ってよいが運営に知らせておくこと。
 * 毎週の集会の日に開くと、その日の LT はすべて LT 会の登壇として扱われ、毎週の流れにも載る。
 */
export function ltEventNotes(event: Pick<LtEvent, 'date' | 'slots'>): string[] {
  const date = parseDateKey(event.date);
  if (!date || date.getDay() !== config.meetupWeekday) return [];
  return [
    `ℹ️ ${formatMeetupDate(event.date)} は毎週の集会の日です。この日の LT 枠は、毎週の 1 枠の代わりに LT 会の ${event.slots} 枠になります。`,
    'ℹ️ この日に確定した登壇者は、毎週の事前告知・開催告知の LT 告知と、イベント登録の「【LTあり】」に全員載ります。',
  ];
}
