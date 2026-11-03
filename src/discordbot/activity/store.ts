import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * 1 日（日本時間）ぶんのサーバー全体の集計。
 * 本文やユーザー名は持たない。人数を数えるためのユーザーは pseudonym.ts で仮名化した ID で持つ。
 */
export interface DayActivity {
  date: string;
  /** 人のメッセージ数。Bot と Webhook は botMessages に分ける */
  messages: number;
  botMessages: number;
  /** スレッドはスレッドの ID で数え、親チャンネルは threadParents で引く */
  messagesByChannel: Record<string, number>;
  /** 日本時間の 0〜23 時 */
  messagesByHour: number[];
  /** 投稿時点で投稿者が持っていたロールごとの件数（@everyone は除く） */
  messagesByRole: Record<string, number>;
  /** その日に発言した人（仮名化済み） */
  authors: string[];
  threadParents: Record<string, string>;
  /** 集計した時点の名前。後から改名されても当時の名前で表示できるように残す */
  channelNames: Record<string, string>;
  roleNames: Record<string, string>;
  reactions: number;
  reactors: string[];
  mentions: { users: number; roles: number; everyone: number };
  voice: {
    /** 1 分ごとの見回りで VC に居た人数の合計（= 人・分） */
    minutes: number;
    minutesByChannel: Record<string, number>;
    /** 見回りで数えた同時接続の最大 */
    peak: number;
    /** VC に入った回数（移動は数えない） */
    sessions: number;
    participants: string[];
  };
  members: { joins: number; leaves: number; joined: string[] };
}

export function emptyDay(date: string): DayActivity {
  return {
    date,
    messages: 0,
    botMessages: 0,
    messagesByChannel: {},
    messagesByHour: Array.from({ length: 24 }, () => 0),
    messagesByRole: {},
    authors: [],
    threadParents: {},
    channelNames: {},
    roleNames: {},
    reactions: 0,
    reactors: [],
    mentions: { users: 0, roles: 0, everyone: 0 },
    voice: { minutes: 0, minutesByChannel: {}, peak: 0, sessions: 0, participants: [] },
    members: { joins: 0, leaves: 0, joined: [] },
  };
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 集計の区切りは日本時間。集会（金曜 22 時）が日付をまたがないようにするため。 */
export function jstDateHour(at: Date): { date: string; hour: number } {
  const shifted = new Date(at.getTime() + JST_OFFSET_MS);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

function addUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

function increment(counts: Record<string, number>, key: string, by = 1): void {
  counts[key] = (counts[key] ?? 0) + by;
}

export interface MessageRecord {
  at: Date;
  channelId: string;
  channelName: string;
  /** スレッド内の投稿のときだけ */
  parent?: { id: string; name: string };
  author: string;
  isBot: boolean;
  roles: ReadonlyArray<{ id: string; name: string }>;
  mentions: { users: number; roles: number; everyone: boolean };
}

export interface VoiceSample {
  at: Date;
  /** VC に居る人（Bot と AFK チャンネルは除いたもの） */
  members: ReadonlyArray<{ user: string; channelId: string; channelName: string }>;
}

/**
 * 日別ファイル（<dir>/YYYY-MM-DD.json）への集計の書き込み。
 * イベントのたびに書くと重いので、メモリ上で足し込んで flush() でまとめて書き出す。
 * 書き出しは tmp → rename で、途中で落ちても前回のファイルが残るようにしている。
 */
export class ActivityStore {
  private days = new Map<string, DayActivity>();
  private dirty = new Set<string>();

  constructor(private readonly dir: string = config.activityDir) {}

  private filePath(date: string): string {
    return path.join(this.dir, `${date}.json`);
  }

  /** その日の集計。再起動をまたいで足し込めるよう、メモリに無ければファイルから読む。 */
  get(date: string): DayActivity {
    const cached = this.days.get(date);
    if (cached) return cached;
    let day = emptyDay(date);
    const file = this.filePath(date);
    if (fs.existsSync(file)) {
      try {
        day = { ...day, ...JSON.parse(fs.readFileSync(file, 'utf-8')) };
      } catch (e) {
        console.error(`Failed to load activity ${file}:`, e);
      }
    }
    this.days.set(date, day);
    return day;
  }

  private update(date: string, apply: (day: DayActivity) => void): void {
    apply(this.get(date));
    this.dirty.add(date);
  }

  recordMessage(record: MessageRecord): void {
    const { date, hour } = jstDateHour(record.at);
    this.update(date, day => {
      day.channelNames[record.channelId] = record.channelName;
      if (record.parent) {
        day.threadParents[record.channelId] = record.parent.id;
        day.channelNames[record.parent.id] = record.parent.name;
      }
      if (record.isBot) {
        day.botMessages += 1;
        return;
      }
      day.messages += 1;
      increment(day.messagesByChannel, record.channelId);
      day.messagesByHour[hour] = (day.messagesByHour[hour] ?? 0) + 1;
      for (const role of record.roles) {
        increment(day.messagesByRole, role.id);
        day.roleNames[role.id] = role.name;
      }
      addUnique(day.authors, record.author);
      day.mentions.users += record.mentions.users;
      day.mentions.roles += record.mentions.roles;
      if (record.mentions.everyone) day.mentions.everyone += 1;
    });
  }

  recordReaction(at: Date, user: string): void {
    this.update(jstDateHour(at).date, day => {
      day.reactions += 1;
      addUnique(day.reactors, user);
    });
  }

  recordVoiceJoin(at: Date): void {
    this.update(jstDateHour(at).date, day => {
      day.voice.sessions += 1;
    });
  }

  /** 1 分ごとに呼ぶ。居た人数ぶん人・分を足すので、呼ぶ間隔は 1 分に固定すること。 */
  recordVoiceSample(sample: VoiceSample): void {
    if (sample.members.length === 0) return;
    this.update(jstDateHour(sample.at).date, day => {
      day.voice.minutes += sample.members.length;
      day.voice.peak = Math.max(day.voice.peak, sample.members.length);
      for (const member of sample.members) {
        increment(day.voice.minutesByChannel, member.channelId);
        day.channelNames[member.channelId] = member.channelName;
        addUnique(day.voice.participants, member.user);
      }
    });
  }

  recordMemberJoin(at: Date, user: string): void {
    this.update(jstDateHour(at).date, day => {
      day.members.joins += 1;
      addUnique(day.members.joined, user);
    });
  }

  recordMemberLeave(at: Date): void {
    this.update(jstDateHour(at).date, day => {
      day.members.leaves += 1;
    });
  }

  /** 変更のあった日を書き出す。書き終えた過去の日はメモリから捨てる。 */
  flush(now: Date = new Date()): void {
    if (this.dirty.size === 0) return;
    fs.mkdirSync(this.dir, { recursive: true });
    for (const date of this.dirty) {
      const day = this.days.get(date);
      if (!day) continue;
      const file = this.filePath(date);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(day, null, 2));
      fs.renameSync(tmp, file);
    }
    this.dirty.clear();
    const today = jstDateHour(now).date;
    for (const date of this.days.keys()) {
      if (date < today) this.days.delete(date);
    }
  }
}

export const activityStore = new ActivityStore();
