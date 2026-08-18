import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { LtEntry, LtEntryInput, LtStatus, newLtEntry } from './types';

interface LtStoreData {
  entries: LtEntry[];
}

const defaultData: LtStoreData = { entries: [] };

/**
 * LT 応募レコードの永続化。週次状態（storage.ts）とは寿命が違うのでファイルを分けている。
 * cron と interaction から同時に書かれうるため、tmp への書き出し → rename で原子的に差し替える。
 */
export class LtStore {
  private data: LtStoreData;

  constructor(private readonly storePath: string = config.ltStorePath) {
    this.data = this.load();
  }

  private load(): LtStoreData {
    if (!fs.existsSync(this.storePath)) return { ...defaultData, entries: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as Partial<LtStoreData>;
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      // isProd を持たない旧レコードはテスト扱いにする。本番の枠を誤って埋めるより、
      // 本番の応募が漏れるほうが運営から見えて気づける（告知前に /status に出ない）。
      return { entries: entries.map(entry => ({ ...entry, isProd: entry.isProd ?? false })) };
    } catch (e) {
      console.error('Failed to load LT store:', e);
      return { ...defaultData, entries: [] };
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

  /** `isProd` を渡すとその応募先のぶんだけ返す。省略時は本番・テスト両方。 */
  list(isProd?: boolean): LtEntry[] {
    return this.data.entries.filter(entry => isProd === undefined || entry.isProd === isProd);
  }

  get(id: string): LtEntry | undefined {
    return this.data.entries.find(entry => entry.id === id);
  }

  create(input: LtEntryInput, now: string = new Date().toISOString()): LtEntry {
    if (this.get(input.id)) {
      throw new Error(`LT レコードが既に存在します: ${input.id}`);
    }
    const entry = newLtEntry(input, now);
    this.data.entries.push(entry);
    this.save();
    return entry;
  }

  /** 既存レコードに patch を浅くマージして保存する。updatedAt は自動で更新される。 */
  update(id: string, patch: Partial<Omit<LtEntry, 'id' | 'createdAt'>>): LtEntry {
    const index = this.data.entries.findIndex(entry => entry.id === id);
    const current = this.data.entries[index];
    if (index === -1 || !current) {
      throw new Error(`LT レコードが見つかりません: ${id}`);
    }
    const updated: LtEntry = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.data.entries[index] = updated;
    this.save();
    return updated;
  }

  remove(id: string): boolean {
    const before = this.data.entries.length;
    this.data.entries = this.data.entries.filter(entry => entry.id !== id);
    if (this.data.entries.length === before) return false;
    this.save();
    return true;
  }

  findBySpeaker(speakerId: string, isProd: boolean, statuses?: readonly LtStatus[]): LtEntry[] {
    return this.data.entries.filter(entry =>
      entry.speakerId === speakerId
      && entry.isProd === isProd
      && (!statuses || statuses.includes(entry.status)),
    );
  }

  /**
   * その開催日に確定済みで枠を消費しているレコード（取り下げは除く）。
   * 枠は本番とテストで別勘定にする。テストの応募が本番の候補日を塞ぐと、
   * 本物の応募者が日程を選べなくなるため。
   */
  entriesOnDate(eventDate: string, isProd: boolean): LtEntry[] {
    return this.data.entries.filter(entry =>
      entry.eventDate === eventDate && entry.isProd === isProd && entry.status !== 'cancelled',
    );
  }

  /** 開催日ごとの使用枠数。日程候補セレクトの満枠判定に使う。 */
  slotUsageByDate(isProd: boolean): Map<string, number> {
    const usage = new Map<string, number>();
    for (const entry of this.data.entries) {
      if (!entry.eventDate || entry.isProd !== isProd || entry.status === 'cancelled') continue;
      usage.set(entry.eventDate, (usage.get(entry.eventDate) ?? 0) + 1);
    }
    return usage;
  }
}

export const ltStore = new LtStore();
