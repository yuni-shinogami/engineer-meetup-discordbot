import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ChatInputCommandInteraction } from 'discord.js';

vi.mock('../../../../config', () => ({
  config: {
    ltSlotsPerDay: 1,
    ltDateCandidates: 2,
    meetupWeekday: 5,
    ltEventStorePath: '',
    ltStorePath: '',
  },
}));
vi.mock('../../../../shared/interaction', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ ${e instanceof Error ? e.message : String(e)}`,
}));
const mocks = vi.hoisted(() => ({ entriesOnDate: vi.fn(), list: vi.fn() }));
vi.mock('../../store', () => ({ ltStore: { entriesOnDate: mocks.entriesOnDate, list: mocks.list } }));

import { handleLtEventCommand } from '../lt-event';
import { LtEventStore } from '../../events';

type Options = Record<string, string | number | boolean | undefined>;

function interaction(subcommand: string, options: Options) {
  const get = (name: string) => options[name] ?? null;
  return {
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) => get(name),
      getInteger: (name: string) => get(name),
      getBoolean: (name: string) => get(name),
    },
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
  } as unknown as ChatInputCommandInteraction & { reply: ReturnType<typeof vi.fn> };
}

const replyText = (i: { reply: ReturnType<typeof vi.fn> }) => (i.reply.mock.calls[0]![0] as { content: string }).content;

// 開催日は来年の土曜（作る時点で過去にならず、毎週の集会の曜日でもない）
const DATE = '2027-01-16';
const createOptions: Options = {
  date: DATE, start: '21:00', end: '23:00', slots: 4, theme: 'はじめての LT', deadline: '2027-01-09', production: true,
};

let dir: string;
let events: LtEventStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lt-event-cmd-'));
  events = new LtEventStore(join(dir, 'lt-events.json'));
  mocks.entriesOnDate.mockReturnValue([]);
  mocks.list.mockReturnValue([]);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('/lt-event create', () => {
  it('LT 会を作る', async () => {
    const i = interaction('create', createOptions);
    await handleLtEventCommand(i, events);
    expect(events.get(DATE, true)).toMatchObject({ theme: 'はじめての LT', slots: 4, applyDeadline: '2027-01-09' });
    expect(replyText(i)).toContain('作りました');
  });

  it('日付は 2027/1/16 のような書き方も受ける', async () => {
    await handleLtEventCommand(interaction('create', { ...createOptions, date: '2027/1/16' }), events);
    expect(events.get(DATE, true)).toBeDefined();
  });

  it('入力に問題があれば作らずに理由を返す', async () => {
    const i = interaction('create', { ...createOptions, start: '23:00', end: '21:00' });
    await handleLtEventCommand(i, events);
    expect(events.list(true)).toEqual([]);
    expect(replyText(i)).toContain('開始時刻より後');
  });

  it('同じ日の LT 会があれば edit を案内する', async () => {
    await handleLtEventCommand(interaction('create', createOptions), events);
    const i = interaction('create', createOptions);
    await handleLtEventCommand(i, events);
    expect(replyText(i)).toContain('/lt-event edit');
  });

  it('production を付けなければテストの LT 会になる', async () => {
    await handleLtEventCommand(interaction('create', { ...createOptions, production: undefined }), events);
    expect(events.get(DATE, false)).toBeDefined();
    expect(events.get(DATE, true)).toBeUndefined();
  });
});

describe('/lt-event edit', () => {
  beforeEach(() => events.create({
    date: DATE, isProd: true, startTime: '21:00', endTime: '23:00', slots: 4, theme: 'はじめての LT', applyDeadline: '2027-01-09',
  }));

  it('指定した項目だけを変える', async () => {
    await handleLtEventCommand(interaction('edit', { date: DATE, slots: 6, production: true }), events);
    expect(events.get(DATE, true)).toMatchObject({ slots: 6, theme: 'はじめての LT' });
  });

  it('確定済みの登壇より枠を減らせない', async () => {
    mocks.entriesOnDate.mockReturnValue([{ id: '1' }, { id: '2' }, { id: '3' }]);
    const i = interaction('edit', { date: DATE, slots: 2, production: true });
    await handleLtEventCommand(i, events);
    expect(events.get(DATE, true)?.slots).toBe(4);
    expect(replyText(i)).toContain('3 人の登壇が確定');
  });

  it('変える項目が無ければ案内する', async () => {
    const i = interaction('edit', { date: DATE, production: true });
    await handleLtEventCommand(i, events);
    expect(replyText(i)).toContain('1 つ以上');
  });
});

describe('/lt-event cancel', () => {
  beforeEach(() => events.create({
    date: DATE, isProd: true, startTime: '21:00', endTime: '23:00', slots: 4, theme: 'はじめての LT', applyDeadline: '2027-01-09',
  }));

  it('取りやめても記録は残し、その日に確定している応募を知らせる', async () => {
    mocks.entriesOnDate.mockReturnValue([{ id: 't1', speakerName: 'ゆに' }]);
    const i = interaction('cancel', { date: DATE, production: true });
    await handleLtEventCommand(i, events);
    expect(events.get(DATE, true)?.cancelled).toBe(true);
    expect(replyText(i)).toContain('確定している応募が 1 件');
    expect(replyText(i)).toContain('<#t1>');
  });

  it('無い LT 会は取りやめられない', async () => {
    const i = interaction('cancel', { date: '2027-02-20', production: true });
    await handleLtEventCommand(i, events);
    expect(replyText(i)).toContain('見つかりません');
  });
});

describe('/lt-event show', () => {
  it('これから開く LT 会と確定・希望の数を出す', async () => {
    events.create({
      date: DATE, isProd: true, startTime: '21:00', endTime: '23:00', slots: 4, theme: 'はじめての LT', applyDeadline: '2027-01-09',
    });
    mocks.entriesOnDate.mockReturnValue([{ id: 't1', speakerName: 'ゆに' }]);
    mocks.list.mockReturnValue([
      { id: 't2', eventDate: null, status: 'applied', preferredDates: [DATE] },
      { id: 't3', eventDate: null, status: 'applied', preferredDates: ['2027-01-15'] },
    ]);
    const i = interaction('show', { production: true });
    await handleLtEventCommand(i, events);
    expect(replyText(i)).toContain('「はじめての LT」');
    expect(replyText(i)).toContain('確定 1/4 枠・希望のみ 1 件');
    expect(replyText(i)).toContain('登壇: ゆに');
  });

  it('LT 会が無ければ作り方を案内する', async () => {
    const i = interaction('show', {});
    await handleLtEventCommand(i, events);
    expect(replyText(i)).toContain('/lt-event create');
  });
});
