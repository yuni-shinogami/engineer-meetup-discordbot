import fs from 'fs';
import path from 'path';
import { config } from '../../config';

/** 1 日のうちの 1 人ぶん。キーは Discord のユーザー ID */
export interface UserDay {
  messages: number;
  messagesByChannel: Record<string, number>;
  /** 付けたリアクションの数 */
  reactions: number;
  /** メンション・リプライした相手（ユーザー ID → 回数） */
  mentionsTo: Record<string, number>;
  voiceMinutes: number;
  voiceSessions: number;
}

/**
 * 1 日（日本時間）ぶんの集計。本文は持たない。
 * 名前は改名で変わるので日別には持たず、users.json の UserProfile で引く。
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
  threadParents: Record<string, string>;
  /** 集計した時点の名前。後から改名されても当時の名前で表示できるように残す */
  channelNames: Record<string, string>;
  roleNames: Record<string, string>;
  reactions: number;
  mentions: { users: number; roles: number; everyone: number };
  voice: {
    /** 1 分ごとの見回りで VC に居た人数の合計（= 人・分） */
    minutes: number;
    minutesByChannel: Record<string, number>;
    /** 見回りで数えた同時接続の最大 */
    peak: number;
    /** VC に入った回数（移動は数えない） */
    sessions: number;
  };
  members: { joined: string[]; left: string[] };
  users: Record<string, UserDay>;
}

/** users.json の 1 人ぶん。最後に見たときの名前を持つ */
export interface UserProfile {
  username: string;
  displayName: string;
  firstSeen: string;
  lastSeen: string;
}

export interface UserRef {
  id: string;
  username: string;
  displayName: string;
}

export function emptyDay(date: string): DayActivity {
  return {
    date,
    messages: 0,
    botMessages: 0,
    messagesByChannel: {},
    messagesByHour: Array.from({ length: 24 }, () => 0),
    messagesByRole: {},
    threadParents: {},
    channelNames: {},
    roleNames: {},
    reactions: 0,
    mentions: { users: 0, roles: 0, everyone: 0 },
    voice: { minutes: 0, minutesByChannel: {}, peak: 0, sessions: 0 },
    members: { joined: [], left: [] },
    users: {},
  };
}

function emptyUserDay(): UserDay {
  return { messages: 0, messagesByChannel: {}, reactions: 0, mentionsTo: {}, voiceMinutes: 0, voiceSessions: 0 };
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
  author: UserRef;
  isBot: boolean;
  roles: ReadonlyArray<{ id: string; name: string }>;
  /** メンションした人とリプライ先（ユーザー ID。重複は除いておく） */
  mentionedUsers: readonly string[];
  mentionedRoles: number;
  mentionsEveryone: boolean;
}

export interface VoiceSample {
  at: Date;
  /** VC に居る人（Bot と AFK チャンネルは除いたもの） */
  members: ReadonlyArray<{ user: UserRef; channelId: string; channelName: string }>;
}

/**
 * 日別ファイル（<dir>/YYYY-MM-DD.json）と名前の対応表（<dir>/users.json）への書き込み。
 * イベントのたびに書くと重いので、メモリ上で足し込んで flush() でまとめて書き出す。
 * 書き出しは tmp → rename で、途中で落ちても前回のファイルが残るようにしている。
 */
export class ActivityStore {
  private days = new Map<string, DayActivity>();
  private dirty = new Set<string>();
  private profiles: Record<string, UserProfile> | null = null;
  private profilesDirty = false;

  constructor(private readonly dir: string = config.activityDir) {}

  private filePath(date: string): string {
    return path.join(this.dir, `${date}.json`);
  }

  private get profilesPath(): string {
    return path.join(this.dir, 'users.json');
  }

  private readJson<T>(file: string): T | null {
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    } catch (e) {
      console.error(`Failed to load activity ${file}:`, e);
      return null;
    }
  }

  private writeJson(file: string, data: unknown): void {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  /** その日の集計。再起動をまたいで足し込めるよう、メモリに無ければファイルから読む。 */
  get(date: string): DayActivity {
    const cached = this.days.get(date);
    if (cached) return cached;
    const day = { ...emptyDay(date), ...this.readJson<Partial<DayActivity>>(this.filePath(date)) };
    this.days.set(date, day);
    return day;
  }

  /** ユーザー ID → 最後に見たときの名前 */
  getProfiles(): Record<string, UserProfile> {
    this.profiles ??= this.readJson<Record<string, UserProfile>>(this.profilesPath) ?? {};
    return this.profiles;
  }

  private update(date: string, apply: (day: DayActivity) => void): void {
    apply(this.get(date));
    this.dirty.add(date);
  }

  private user(day: DayActivity, user: UserRef, at: Date): UserDay {
    this.seen(user, at);
    day.users[user.id] ??= emptyUserDay();
    return day.users[user.id]!;
  }

  private seen(user: UserRef, at: Date): void {
    const profiles = this.getProfiles();
    const iso = at.toISOString();
    const current = profiles[user.id];
    if (!current) {
      profiles[user.id] = { username: user.username, displayName: user.displayName, firstSeen: iso, lastSeen: iso };
      this.profilesDirty = true;
      return;
    }
    if (iso < current.firstSeen) {
      current.firstSeen = iso;
      this.profilesDirty = true;
    }
    // 履歴の取り込みは過去にさかのぼるので、古い名前で新しい名前を上書きしない
    const renamed = current.username !== user.username || current.displayName !== user.displayName;
    if (iso.slice(0, 10) > current.lastSeen.slice(0, 10) || (renamed && iso >= current.lastSeen)) {
      current.username = user.username;
      current.displayName = user.displayName;
      current.lastSeen = iso;
      this.profilesDirty = true;
    }
  }

  /** 保存済みの日付（YYYY-MM-DD）。 */
  savedDates(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map(name => name.slice(0, 10))
      .sort();
  }

  /**
   * その日のメッセージ由来の集計を空にする。履歴から作り直す前に呼ぶ。
   * VC・リアクション・参加/退出は履歴から取れないので残す。
   */
  resetMessages(date: string): void {
    this.update(date, day => {
      const empty = emptyDay(date);
      day.messages = empty.messages;
      day.botMessages = empty.botMessages;
      day.messagesByChannel = empty.messagesByChannel;
      day.messagesByHour = empty.messagesByHour;
      day.messagesByRole = empty.messagesByRole;
      day.mentions = empty.mentions;
      for (const user of Object.values(day.users)) {
        user.messages = 0;
        user.messagesByChannel = {};
        user.mentionsTo = {};
      }
    });
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
      day.mentions.users += record.mentionedUsers.length;
      day.mentions.roles += record.mentionedRoles;
      if (record.mentionsEveryone) day.mentions.everyone += 1;

      const user = this.user(day, record.author, record.at);
      user.messages += 1;
      increment(user.messagesByChannel, record.channelId);
      for (const target of record.mentionedUsers) {
        if (target !== record.author.id) increment(user.mentionsTo, target);
      }
    });
  }

  recordReaction(at: Date, user: UserRef): void {
    this.update(jstDateHour(at).date, day => {
      day.reactions += 1;
      this.user(day, user, at).reactions += 1;
    });
  }

  recordVoiceJoin(at: Date, user: UserRef): void {
    this.update(jstDateHour(at).date, day => {
      day.voice.sessions += 1;
      this.user(day, user, at).voiceSessions += 1;
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
        this.user(day, member.user, sample.at).voiceMinutes += 1;
      }
    });
  }

  recordMemberJoin(at: Date, user: UserRef): void {
    this.seen(user, at);
    this.update(jstDateHour(at).date, day => addUnique(day.members.joined, user.id));
  }

  recordMemberLeave(at: Date, userId: string): void {
    this.update(jstDateHour(at).date, day => addUnique(day.members.left, userId));
  }

  /** 変更のあった日と名前の対応表を書き出す。書き終えた過去の日はメモリから捨てる。 */
  flush(now: Date = new Date()): void {
    if (this.dirty.size === 0 && !this.profilesDirty) return;
    fs.mkdirSync(this.dir, { recursive: true });
    for (const date of this.dirty) {
      const day = this.days.get(date);
      if (day) this.writeJson(this.filePath(date), day);
    }
    this.dirty.clear();
    if (this.profilesDirty && this.profiles) {
      this.writeJson(this.profilesPath, this.profiles);
      this.profilesDirty = false;
    }
    const today = jstDateHour(now).date;
    for (const date of this.days.keys()) {
      if (date < today) this.days.delete(date);
    }
  }
}

export const activityStore = new ActivityStore();
