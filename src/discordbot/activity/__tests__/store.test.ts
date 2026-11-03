import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ActivityStore, jstDateHour, MessageRecord, UserRef } from '../store';

const userA: UserRef = { id: 'u-a', username: 'alice', displayName: 'ありす' };
const userB: UserRef = { id: 'u-b', username: 'bob', displayName: 'ぼぶ' };

const message = (over: Partial<MessageRecord> = {}): MessageRecord => ({
  at: new Date('2026-11-06T13:30:00Z'), // 日本時間 11/6（金）22:30
  channelId: 'ch-1',
  channelName: 'random',
  author: userA,
  isBot: false,
  roles: [],
  mentionedUsers: [],
  mentionedRoles: 0,
  mentionsEveryone: false,
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

  const saved = (name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf-8'));

  it('メッセージをチャンネル・時間帯・ユーザーごとに数える', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message());
    store.recordMessage(message());
    store.recordMessage(message({ author: userB, channelId: 'ch-2', channelName: 'ねこ' }));
    store.flush();

    const day = saved('2026-11-06');
    expect(day.messages).toBe(3);
    expect(day.messagesByChannel).toEqual({ 'ch-1': 2, 'ch-2': 1 });
    expect(day.messagesByHour[22]).toBe(3);
    expect(day.channelNames).toEqual({ 'ch-1': 'random', 'ch-2': 'ねこ' });
    expect(day.users['u-a'].messages).toBe(2);
    expect(day.users['u-a'].messagesByChannel).toEqual({ 'ch-1': 2 });
    expect(day.users['u-b'].messagesByChannel).toEqual({ 'ch-2': 1 });
  });

  it('名前は users.json に最新のものを持つ', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message());
    store.recordMessage(message({
      at: new Date('2026-11-07T13:30:00Z'),
      author: { ...userA, displayName: 'ありす（改名）' },
    }));
    store.flush();

    expect(saved('users')).toEqual({
      'u-a': {
        username: 'alice',
        displayName: 'ありす（改名）',
        firstSeen: '2026-11-06T13:30:00.000Z',
        lastSeen: '2026-11-07T13:30:00.000Z',
      },
    });
    expect(JSON.stringify(saved('2026-11-06'))).not.toContain('alice');
  });

  it('Bot の投稿は件数だけ別に数え、ユーザーやチャンネルの集計には入れない', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message({ isBot: true, author: { id: 'bot', username: 'bot', displayName: 'bot' } }));
    store.flush();

    const day = saved('2026-11-06');
    expect(day.messages).toBe(0);
    expect(day.botMessages).toBe(1);
    expect(day.users).toEqual({});
    expect(day.messagesByChannel).toEqual({});
    expect(existsSync(join(dir, 'users.json'))).toBe(false);
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

  it('ロールとメンションを数え、メンションした相手をユーザーごとに持つ（自分宛ては除く）', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message({
      roles: [{ id: 'r-1', name: '運営' }],
      mentionedUsers: ['u-b', 'u-a'],
      mentionedRoles: 1,
      mentionsEveryone: true,
    }));
    store.flush();

    const day = saved('2026-11-06');
    expect(day.messagesByRole).toEqual({ 'r-1': 1 });
    expect(day.roleNames).toEqual({ 'r-1': '運営' });
    expect(day.mentions).toEqual({ users: 2, roles: 1, everyone: 1 });
    expect(day.users['u-a'].mentionsTo).toEqual({ 'u-b': 1 });
  });

  it('VC は見回りごとに人数ぶんの分数と同時接続の最大を数える', () => {
    const store = new ActivityStore(dir);
    const at = new Date('2026-11-06T13:00:00Z');
    store.recordVoiceSample({ at, members: [
      { user: userA, channelId: 'vc-1', channelName: 'もくもく' },
      { user: userB, channelId: 'vc-1', channelName: 'もくもく' },
    ] });
    store.recordVoiceSample({ at, members: [{ user: userA, channelId: 'vc-1', channelName: 'もくもく' }] });
    store.recordVoiceJoin(at, userA);
    store.flush();

    const day = saved('2026-11-06');
    expect(day.voice).toEqual({ minutes: 3, minutesByChannel: { 'vc-1': 3 }, peak: 2, sessions: 1 });
    expect(day.users['u-a'].voiceMinutes).toBe(2);
    expect(day.users['u-a'].voiceSessions).toBe(1);
    expect(day.users['u-b'].voiceMinutes).toBe(1);
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
    store.recordReaction(at, userA);
    store.recordReaction(at, userA);
    store.recordMemberJoin(at, userB);
    store.recordMemberLeave(at, 'u-c');
    store.flush();

    const day = saved('2026-11-06');
    expect(day.reactions).toBe(2);
    expect(day.users['u-a'].reactions).toBe(2);
    expect(day.members).toEqual({ joined: ['u-b'], left: ['u-c'] });
    expect(saved('users')['u-b'].displayName).toBe('ぼぶ');
  });

  it('再起動しても保存済みの集計と名前に足し込む', () => {
    const first = new ActivityStore(dir);
    first.recordMessage(message());
    first.flush();

    const second = new ActivityStore(dir);
    second.recordMessage(message({ author: userB }));
    second.flush();

    const day = saved('2026-11-06');
    expect(day.messages).toBe(2);
    expect(Object.keys(day.users)).toEqual(['u-a', 'u-b']);
    expect(Object.keys(saved('users'))).toEqual(['u-a', 'u-b']);
  });

  it('古い日付の記録では名前を上書きせず、最初に見た日時だけをさかのぼる', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message({ at: new Date('2026-11-06T13:30:00Z'), author: { ...userA, displayName: '新しい名前' } }));
    store.recordMessage(message({ at: new Date('2026-10-01T13:30:00Z'), author: { ...userA, displayName: '古い名前' } }));
    store.flush();

    expect(saved('users')['u-a']).toEqual({
      username: 'alice',
      displayName: '新しい名前',
      firstSeen: '2026-10-01T13:30:00.000Z',
      lastSeen: '2026-11-06T13:30:00.000Z',
    });
  });

  it('resetMessages はメッセージ由来の集計だけを空にし、VC とリアクションは残す', () => {
    const at = new Date('2026-11-06T13:00:00Z');
    const first = new ActivityStore(dir);
    first.recordMessage(message({ mentionedUsers: ['u-b'] }));
    first.recordReaction(at, userA);
    first.recordVoiceSample({ at, members: [{ user: userA, channelId: 'vc-1', channelName: 'もくもく' }] });
    first.flush();

    const second = new ActivityStore(dir);
    expect(second.savedDates()).toEqual(['2026-11-06']);
    second.resetMessages('2026-11-06');
    second.recordMessage(message({ author: userB }));
    second.flush();

    const day = saved('2026-11-06');
    expect(day.messages).toBe(1);
    expect(day.messagesByChannel).toEqual({ 'ch-1': 1 });
    expect(day.mentions).toEqual({ users: 0, roles: 0, everyone: 0 });
    expect(day.users['u-a']).toMatchObject({ messages: 0, messagesByChannel: {}, mentionsTo: {}, reactions: 1, voiceMinutes: 1 });
    expect(day.users['u-b'].messages).toBe(1);
    expect(day.voice.minutes).toBe(1);
    expect(day.reactions).toBe(1);
  });

  it('日本時間の日付ごとにファイルを分け、変更が無ければ書かない', () => {
    const store = new ActivityStore(dir);
    store.recordMessage(message({ at: new Date('2026-11-06T14:59:00Z') }));
    store.recordMessage(message({ at: new Date('2026-11-06T15:00:00Z') }));
    store.flush();
    expect(readdirSync(dir).sort()).toEqual(['2026-11-06.json', '2026-11-07.json', 'users.json']);

    rmSync(join(dir, '2026-11-06.json'));
    store.flush();
    expect(existsSync(join(dir, '2026-11-06.json'))).toBe(false);
  });
});
