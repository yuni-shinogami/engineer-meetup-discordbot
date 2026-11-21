import fs from 'fs';
import path from 'path';

/**
 * マッチングの記録。置き場所（config.matchDir）には次の 3 つのファイルがある。
 *
 * - state.json         申し込んだ人・本人確認の途中の人・今夜ボタンを押した人（この Bot だけが読み書きする）
 * - optin-ids.json     申し込んだ人の VRChat のユーザー ID だけの一覧。分析（engineer-meetup-analytics）が
 *                      deploy/analytics-export.sh の match-optins で取っていく
 * - profiles.json      分析が match-profiles で置いていく、申し込んだ人の活動の混ざり方と主なタグ。この Bot は読むだけ
 *
 * 分析に渡すのは申し込んだ人の VRChat のユーザー ID だけで、Discord の ID は渡さない。
 */

export interface MatchOptin {
  vrcUserId: string;
  displayName: string;
  joinedAt: string;
}

export interface MatchPending {
  vrcUserId: string;
  displayName: string;
  code: string;
  expiresAt: string;
}

/** 分析が作る、1 人分の「何をやっていそうか」。mix は活動ごとの割合（足すと 1） */
export interface MatchProfile {
  mix: number[];
  group: string;
  tags: string[];
}

export interface MatchProfiles {
  generatedAt: string;
  profiles: Record<string, MatchProfile>;
}

interface MatchState {
  optins: Record<string, MatchOptin>;
  pending: Record<string, MatchPending>;
  /** 回の日付（YYYY-MM-DD） -> その夜ボタンを押した Discord ユーザー */
  checkins: Record<string, string[]>;
}

const STATE = 'state.json';
const OPTIN_IDS = 'optin-ids.json';
const PROFILES = 'profiles.json';
/** 今夜の記録を残す回の数。前の回の人が薦められないよう、使うのはその夜の分だけ */
const KEEP_CHECKIN_DATES = 2;

function emptyState(): MatchState {
  return { optins: {}, pending: {}, checkins: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class MatchStore {
  private data: MatchState;

  constructor(private readonly dir: string) {
    this.data = this.load();
  }

  private load(): MatchState {
    const file = path.join(this.dir, STATE);
    if (!fs.existsSync(file)) return emptyState();
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<MatchState>;
      return {
        optins: isRecord(parsed.optins) ? parsed.optins as MatchState['optins'] : {},
        pending: isRecord(parsed.pending) ? parsed.pending as MatchState['pending'] : {},
        checkins: isRecord(parsed.checkins) ? parsed.checkins as MatchState['checkins'] : {},
      };
    } catch (e) {
      console.error('Failed to load match store:', e);
      return emptyState();
    }
  }

  private write(name: string, value: unknown): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, name);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  }

  private save(): void {
    this.write(STATE, this.data);
    // 分析に渡す一覧は、申し込みが変わるたびに作り直す
    this.write(OPTIN_IDS, [...new Set(Object.values(this.data.optins).map(o => o.vrcUserId))].sort());
  }

  getOptin(discordUserId: string): MatchOptin | undefined {
    return this.data.optins[discordUserId];
  }

  optins(): Record<string, MatchOptin> {
    return this.data.optins;
  }

  startPending(discordUserId: string, pending: MatchPending): void {
    this.data.pending[discordUserId] = pending;
    this.save();
  }

  getPending(discordUserId: string): MatchPending | undefined {
    return this.data.pending[discordUserId];
  }

  /**
   * 本人確認が済んだ人を申し込みにする。同じ VRChat アカウントでほかの Discord ユーザーが申し込んでいたら、
   * そちらを外す（本人確認が済んだ方を正とする）。
   */
  confirm(discordUserId: string, now: string = new Date().toISOString()): MatchOptin | undefined {
    const pending = this.data.pending[discordUserId];
    if (!pending) return undefined;
    for (const [other, optin] of Object.entries(this.data.optins)) {
      if (other !== discordUserId && optin.vrcUserId === pending.vrcUserId) this.dropUser(other);
    }
    const optin = { vrcUserId: pending.vrcUserId, displayName: pending.displayName, joinedAt: now };
    this.data.optins[discordUserId] = optin;
    delete this.data.pending[discordUserId];
    this.save();
    return optin;
  }

  /**
   * 申し込み・確認の途中・今夜の記録をまとめて消す。何か消したら true。
   * 分析の次の受け渡しを待たずに、その人のプロフィールも profiles.json から消す
   */
  remove(discordUserId: string): boolean {
    const vrcUserId = this.data.optins[discordUserId]?.vrcUserId;
    const had = discordUserId in this.data.optins || discordUserId in this.data.pending;
    this.dropUser(discordUserId);
    this.save();
    if (vrcUserId && !Object.values(this.data.optins).some(o => o.vrcUserId === vrcUserId)) {
      const current = this.profiles();
      if (vrcUserId in current.profiles) {
        delete current.profiles[vrcUserId];
        this.write(PROFILES, current);
      }
    }
    return had;
  }

  private dropUser(discordUserId: string): void {
    delete this.data.optins[discordUserId];
    delete this.data.pending[discordUserId];
    for (const [date, ids] of Object.entries(this.data.checkins)) {
      this.data.checkins[date] = ids.filter(id => id !== discordUserId);
    }
  }

  /** その夜ボタンを押した記録を付け、その夜に押した人の一覧を返す。古い回の記録は捨てる */
  checkIn(date: string, discordUserId: string): string[] {
    const list = this.data.checkins[date] ?? [];
    if (!list.includes(discordUserId)) list.push(discordUserId);
    this.data.checkins[date] = list;
    for (const old of Object.keys(this.data.checkins).sort().slice(0, -KEEP_CHECKIN_DATES)) {
      delete this.data.checkins[old];
    }
    this.save();
    return list;
  }

  /** 分析が置いていったプロフィール。まだ無い・読めないときは空 */
  profiles(): MatchProfiles {
    const file = path.join(this.dir, PROFILES);
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<MatchProfiles>;
      if (isRecord(parsed.profiles)) {
        return { generatedAt: String(parsed.generatedAt ?? ''), profiles: parsed.profiles as MatchProfiles['profiles'] };
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Failed to load match profiles:', e);
    }
    return { generatedAt: '', profiles: {} };
  }
}
