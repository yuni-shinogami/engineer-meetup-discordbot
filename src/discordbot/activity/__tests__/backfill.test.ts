import { describe, it, expect } from 'vitest';
import { APIMessage, MessageType } from 'discord.js';
import { parseBackfillArgs, toMessageRecord } from '../backfill';

const now = new Date('2026-11-04T03:00:00Z'); // 日本時間 11/4 12:00

describe('parseBackfillArgs', () => {
  it('既定は最初から今日（日本時間）の始まりまで', () => {
    const options = parseBackfillArgs([], now);
    expect(options.since).toBeNull();
    expect(options.until.toISOString()).toBe('2026-11-03T15:00:00.000Z');
  });

  it('--since と --until は日本時間の日の始まりとして読む', () => {
    const options = parseBackfillArgs(['--since', '2026-01-01', '--until', '2026-11-01', '--dir', '/tmp/a'], now);
    expect(options.since?.toISOString()).toBe('2025-12-31T15:00:00.000Z');
    expect(options.until.toISOString()).toBe('2026-10-31T15:00:00.000Z');
    expect(options.dir).toBe('/tmp/a');
  });

  it('今日より先の --until は Bot の集計と重なるので拒否する', () => {
    expect(() => parseBackfillArgs(['--until', '2026-11-05'], now)).toThrow(/今日より先/);
  });

  it('日付の形式と前後関係を確かめる', () => {
    expect(() => parseBackfillArgs(['--since', '2026/01/01'], now)).toThrow(/YYYY-MM-DD/);
    expect(() => parseBackfillArgs(['--since', '2026-11-02', '--until', '2026-11-01'], now)).toThrow(/より前/);
  });
});

const user = (id: string, over: Record<string, unknown> = {}) => ({
  id, username: `user-${id}`, global_name: null, discriminator: '0', avatar: null, ...over,
});

const apiMessage = (over: Partial<APIMessage> = {}): APIMessage => ({
  id: 'm-1',
  channel_id: 'ch-1',
  type: MessageType.Default,
  timestamp: '2026-11-01T13:00:00.000Z',
  author: user('a'),
  content: '',
  edited_timestamp: null,
  tts: false,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  ...over,
} as APIMessage);

describe('toMessageRecord', () => {
  const target = { id: 'th-1', name: 'お題', parent: { id: 'ch-1', name: 'random' } };

  it('チャンネル・投稿者・時刻を集計の形にする', () => {
    const record = toMessageRecord(apiMessage(), target, new Map([['a', 'ありす']]));
    expect(record).toMatchObject({
      at: new Date('2026-11-01T13:00:00.000Z'),
      channelId: 'th-1',
      parent: { id: 'ch-1', name: 'random' },
      author: { id: 'a', username: 'user-a', displayName: 'ありす' },
      isBot: false,
      roles: [],
    });
  });

  it('サーバーの表示名が無ければグローバルの名前、それも無ければユーザー名', () => {
    const global = toMessageRecord(apiMessage({ author: user('a', { global_name: 'Alice' }) }), target, new Map());
    expect(global?.author.displayName).toBe('Alice');
    expect(toMessageRecord(apiMessage(), target, new Map())?.author.displayName).toBe('user-a');
  });

  it('システムメッセージは数えない', () => {
    expect(toMessageRecord(apiMessage({ type: MessageType.UserJoin }), target, new Map())).toBeNull();
  });

  it('Bot と Webhook の投稿は Bot として扱う', () => {
    expect(toMessageRecord(apiMessage({ author: user('b', { bot: true }) }), target, new Map())?.isBot).toBe(true);
    expect(toMessageRecord(apiMessage({ webhook_id: 'w-1' }), target, new Map())?.isBot).toBe(true);
  });

  it('メンションとリプライ先を人だけ重複なく数える', () => {
    const record = toMessageRecord(apiMessage({
      type: MessageType.Reply,
      mentions: [user('b'), user('bot', { bot: true })] as APIMessage['mentions'],
      referenced_message: apiMessage({ author: user('b') }),
      mention_roles: ['r-1'],
      mention_everyone: true,
    }), target, new Map());
    expect(record?.mentionedUsers).toEqual(['b']);
    expect(record?.mentionedRoles).toBe(1);
    expect(record?.mentionsEveryone).toBe(true);
  });
});
