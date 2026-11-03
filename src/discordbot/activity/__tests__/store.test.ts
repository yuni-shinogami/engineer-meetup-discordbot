import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ActivityStore, jstDateHour, MessageRecord } from '../store';

const message = (over: Partial<MessageRecord> = {}): MessageRecord => ({
  at: new Date('2026-11-06T13:30:00Z'), // 日本時間 11/6（金）22:30
  channelId: 'ch-1',
  channelName: 'random',
  author: 'user-a',
  isBot: false,
  roles: [],
  mentions: { users: 0, roles: 0, everyone: false },
  ...over,
});

describe('jstDateHour', () => {
  it('日本時間の日付と時を返す', () => {
    expect(jstDateHour(new Date('2026-11-06T13:30:00Z'))).toEqual({ date: '2026-11-06', hour: 22 });
  });

  it('UTC の 15 時以降は日本時間の翌日になる', () => {
    expect(jstDateHour(new Date('2026-11-06T15:00:00Z'))).toEqual({ date: '2026-11-07', hour: 0 });
  });
});

describe('ActivityStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'activity-test-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const saved = (date: string) => JSON.parse(readFileSync(join(dir, `${date}.json`), 'utf-8'));

  it('メッセージをチャンネル・時間帯・発言者ごとに数える', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message());
    store.recordMessage(message());
    store.recordMessage(message({ author: 'user-b', channelId: 'ch-2', channelName: 'ねこ' }));
    store.flush();

    const day = saved('2026-11-06');
    expect(day.messages).toBe(3);
    expect(day.messagesByChannel).toEqual({ 'ch-1': 2, 'ch-2': 1 });
    expect(day.messagesByHour[22]).toBe(3);
    expect(day.authors).toEqual(['user-a', 'user-b']);
    expect(day.channelNames).toEqual({ 'ch-1': 'random', 'ch-2': 'ねこ' });
  });

  it('Bot の投稿は件数だけ別に数え、発言者やチャンネルの集計には入れない', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message({ isBot: true, author: 'bot' }));
    store.flush();

    const day = saved('2026-11-06');
    expect(day.messages).toBe(0);
    expect(day.botMessages).toBe(1);
    expect(day.authors).toEqual([]);
    expect(day.messagesByChannel).toEqual({});
  });

  it('スレッドの投稿は親チャンネルを覚えておく', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message({ channelId: 'th-1', channelName: '今週のお題', parent: { id: 'ch-1', name: 'random' } }));
    store.flush();

    const day = saved('2026-11-06');
    expect(day.messagesByChannel).toEqual({ 'th-1': 1 });
    expect(day.threadParents).toEqual({ 'th-1': 'ch-1' });
    expect(day.channelNames).toEqual({ 'th-1': '今週のお題', 'ch-1': 'random' });
  });

  it('ロールとメンションを数える', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message({
      roles: [{ id: 'r-1', name: '運営' }],
      mentions: { users: 2, roles: 1, everyone: true },
    }));
    store.flush();

    const day = saved('2026-11-06');
    expect(day.messagesByRole).toEqual({ 'r-1': 1 });
    expect(day.roleNames).toEqual({ 'r-1': '運営' });
    expect(day.mentions).toEqual({ users: 2, roles: 1, everyone: 1 });
  });

  it('VC は見回りごとに人数ぶんの分数と同時接続の最大を数える', () => {
    const store = new ActivityStore(dir);
    const at = new Date('2026-11-06T13:00:00Z');
    store.recordVoiceSample({ at, members: [
      { user: 'user-a', channelId: 'vc-1', channelName: 'もくもく' },
      { user: 'user-b', channelId: 'vc-1', channelName: 'もくもく' },
    ] });
    store.recordVoiceSample({ at, members: [{ user: 'user-a', channelId: 'vc-1', channelName: 'もくもく' }] });
    store.recordVoiceJoin(at);
    store.flush();

    expect(saved('2026-11-06').voice).toEqual({
      minutes: 3,
      minutesByChannel: { 'vc-1': 3 },
      peak: 2,
      sessions: 1,
      participants: ['user-a', 'user-b'],
    });
  });

  it('誰も VC に居ない見回りではファイルを作らない', () => {
    const store = new ActivityStore(dir);
    store.recordVoiceSample({ at: new Date(), members: [] });
    store.flush();
    expect(readdirSync(dir)).toEqual([]);
  });

  it('リアクションと参加・退出を数える', () => {
    const store = new ActivityStore(dir);
    const at = new Date('2026-11-06T13:00:00Z');
    store.recordReaction(at, 'user-a');
    store.recordReaction(at, 'user-a');
    store.recordMemberJoin(at, 'user-c');
    store.recordMemberLeave(at);
    store.flush();

    const day = saved('2026-11-06');
    expect(day.reactions).toBe(2);
    expect(day.reactors).toEqual(['user-a']);
    expect(day.members).toEqual({ joins: 1, leaves: 1, joined: ['user-c'] });
  });

  it('再起動しても保存済みの集計に足し込む', () => {
    const first = new ActivityStore(dir);
    first.recordMessage(message());
    first.flush();

    const second = new ActivityStore(dir);
    second.recordMessage(message({ author: 'user-b' }));
    second.flush();

    const day = saved('2026-11-06');
    expect(day.messages).toBe(2);
    expect(day.authors).toEqual(['user-a', 'user-b']);
  });

  it('日本時間の日付ごとにファイルを分け、変更が無ければ書かない', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message({ at: new Date('2026-11-06T14:59:00Z') }));
    store.recordMessage(message({ at: new Date('2026-11-06T15:00:00Z') }));
    store.flush();
    expect(readdirSync(dir).sort()).toEqual(['2026-11-06.json', '2026-11-07.json']);

    rmSync(join(dir, '2026-11-06.json'));
    store.flush();
    expect(existsSync(join(dir, '2026-11-06.json'))).toBe(false);
  });
});
