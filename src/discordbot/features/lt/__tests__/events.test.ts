import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../../../config', () => ({
  config: {
    ltSlotsPerDay: 1,
    ltDateCandidates: 2,
    meetupWeekday: 5,
    ltEventStorePath: '',
  },
}));

import {
  applicantDateCandidates,
  dateOptionLabel,
  LtEventInput,
  ltEventNotes,
  LtEventStore,
  ltEventOn,
  operatorDateCandidates,
  slotsOn,
  upcomingLtEvents,
  validateLtEvent,
} from '../events';

// 2026-11-04 は水曜。毎週の集会（金曜）の候補は 11/6・11/13
const NOW = new Date(2026, 10, 4, 12, 0);

const input = (overrides: Partial<LtEventInput> = {}): LtEventInput => ({
  date: '2026-11-21', // 土曜
  isProd: true,
  startTime: '21:00',
  endTime: '23:00',
  slots: 5,
  theme: 'はじめての LT',
  applyDeadline: '2026-11-14',
  ...overrides,
});

let dir: string;
let store: LtEventStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lt-events-'));
  store = new LtEventStore(join(dir, 'lt-events.json'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('LtEventStore', () => {
  it('作った LT 会をファイルに残し、読み直せる', () => {
    store.create(input());
    const reloaded = new LtEventStore(join(dir, 'lt-events.json'));
    expect(reloaded.get('2026-11-21', true)).toMatchObject({ theme: 'はじめての LT', slots: 5, cancelled: false });
    expect(JSON.parse(readFileSync(join(dir, 'lt-events.json'), 'utf-8')).events).toHaveLength(1);
  });

  it('同じ日・同じ応募先の LT 会は 2 つ作れない', () => {
    store.create(input());
    expect(() => store.create(input())).toThrow(/既にあります/);
  });

  // テストの LT 会が本番の候補日に出ないよう、本番とテストは別に持つ
  it('本番とテストは同じ日でも別の LT 会として持つ', () => {
    store.create(input());
    store.create(input({ isProd: false, theme: 'テスト' }));
    expect(store.list(true).map(e => e.theme)).toEqual(['はじめての LT']);
    expect(store.list(false).map(e => e.theme)).toEqual(['テスト']);
  });

  it('変えた項目だけを上書きする', () => {
    store.create(input());
    const updated = store.update('2026-11-21', true, { slots: 6 });
    expect(updated).toMatchObject({ slots: 6, theme: 'はじめての LT' });
  });
});

describe('ltEventOn / slotsOn', () => {
  it('LT 会の日はその LT 会の枠数、ほかの日は毎週の集会の枠数', () => {
    store.create(input());
    expect(slotsOn('2026-11-21', true, store)).toBe(5);
    expect(slotsOn('2026-11-13', true, store)).toBe(1);
  });

  it('取りやめた LT 会は無いものとして扱う', () => {
    store.create(input());
    store.update('2026-11-21', true, { cancelled: true });
    expect(ltEventOn('2026-11-21', true, store)).toBeUndefined();
    expect(slotsOn('2026-11-21', true, store)).toBe(1);
  });
});

describe('候補日', () => {
  beforeEach(() => {
    store.create(input());
    store.create(input({ date: '2026-10-31', applyDeadline: '2026-10-24' })); // 開催日を過ぎた
    store.create(input({ date: '2026-11-08', applyDeadline: '2026-11-07' }));
    store.update('2026-11-08', true, { cancelled: true }); // 取りやめた
  });

  it('これから開く LT 会だけを返す', () => {
    expect(upcomingLtEvents(true, NOW, store).map(e => e.date)).toEqual(['2026-11-21']);
  });

  it('登壇者の候補日は、毎週の集会の候補日と応募を受け付けている LT 会の日を日付順に並べる', () => {
    expect(applicantDateCandidates(true, NOW, store)).toEqual(['2026-11-06', '2026-11-13', '2026-11-21']);
  });

  it('応募の締切を過ぎた LT 会は、登壇者の候補日に出さない', () => {
    const afterDeadline = new Date(2026, 10, 15, 12, 0);
    expect(applicantDateCandidates(true, afterDeadline, store)).not.toContain('2026-11-21');
  });

  it('運営の候補日には、締切を過ぎた LT 会も出す', () => {
    const afterDeadline = new Date(2026, 10, 15, 12, 0);
    expect(operatorDateCandidates(true, afterDeadline, store)).toContain('2026-11-21');
  });

  it('テストの LT 会は本番の候補日に出さない', () => {
    expect(applicantDateCandidates(false, NOW, store)).toEqual(['2026-11-06', '2026-11-13']);
  });

  it('LT 会の日は選択肢で分かるようにする', () => {
    expect(dateOptionLabel('2026-11-21', true, store)).toBe('11月21日(土) 🎤LT会');
    expect(dateOptionLabel('2026-11-13', true, store)).toBe('11月13日(金)');
  });
});

describe('validateLtEvent', () => {
  it('問題が無ければ空', () => {
    expect(validateLtEvent(input(), { now: NOW })).toEqual([]);
  });

  it('過去の日付には作れない', () => {
    expect(validateLtEvent(input({ date: '2026-11-01', applyDeadline: '2026-10-30' }), { now: NOW }).join())
      .toContain('過去の日付');
  });

  it('毎週の集会の日にも作れる', () => {
    expect(validateLtEvent(input({ date: '2026-11-20' }), { now: NOW })).toEqual([]);
  });

  it('時刻の書き方と前後を確かめる', () => {
    expect(validateLtEvent(input({ startTime: '21時' }), { now: NOW }).join()).toContain('HH:MM');
    expect(validateLtEvent(input({ startTime: '23:00', endTime: '21:00' }), { now: NOW }).join())
      .toContain('開始時刻より後');
  });

  it('枠数は 1〜20、確定済みの数より減らせない', () => {
    expect(validateLtEvent(input({ slots: 0 }), { now: NOW }).join()).toContain('1〜20');
    expect(validateLtEvent(input({ slots: 2 }), { now: NOW, used: 3 }).join()).toContain('3 人の登壇が確定');
  });

  it('応募締切は開催日より後にできない', () => {
    expect(validateLtEvent(input({ applyDeadline: '2026-11-22' }), { now: NOW }).join()).toContain('開催日より前');
  });

  // 作ったあとの変更では日付を確かめない（当日の調整もできるように）
  it('checkDate: false なら開催日の検査をしない', () => {
    expect(validateLtEvent(input({ date: '2026-11-01', applyDeadline: '2026-10-30' }), { now: NOW, checkDate: false }))
      .toEqual([]);
  });
});

describe('ltEventNotes', () => {
  it('毎週の集会の日なら、枠と毎週の流れへの載り方を知らせる', () => {
    const notes = ltEventNotes({ date: '2026-11-20', slots: 4 }).join('\n');
    expect(notes).toContain('LT 会の 4 枠');
    expect(notes).toContain('【LTあり】');
  });

  it('ほかの日なら何も知らせない', () => {
    expect(ltEventNotes({ date: '2026-11-21', slots: 4 })).toEqual([]);
  });

  // 毎週の集会の日に LT 会を開くと、その日の枠数は LT 会の枠数になる
  it('毎週の集会の日の枠数は LT 会の枠数になる', () => {
    store.create(input({ date: '2026-11-20' }));
    expect(slotsOn('2026-11-20', true, store)).toBe(5);
  });
});
