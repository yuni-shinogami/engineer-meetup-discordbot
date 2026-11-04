import {
  APIGuildMember,
  APIMessage,
  APIThreadChannel,
  ChannelType,
  Constants,
  DiscordAPIError,
  MessageType,
  REST,
  Routes,
} from 'discord.js';
import { config } from '../../config';
import { ActivityStore, jstDateHour, MessageRecord } from './store';

/**
 * 過去のメッセージ履歴から日別集計のメッセージ部分を作り直す。
 *   npm run activity:backfill -- [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--dir path]
 *
 * ゲートウェイには繋がず REST だけを使うので、本番の Bot が動いたままでも実行できる。
 * 期間内の日はメッセージ由来の集計をいったん空にしてから数え直すので、何度実行しても同じ結果になる。
 * 履歴から取れないもの（投稿時点のロール・リアクションした人・VC・参加/退出）は作らない。
 */

/** メッセージを読めるチャンネル */
const MESSAGE_CHANNEL_TYPES: readonly ChannelType[] = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
];

/** スレッドを持てるチャンネル。フォーラムはスレッドの中だけにメッセージがある */
const THREAD_PARENT_TYPES: readonly ChannelType[] = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
];

const NON_SYSTEM_TYPES: readonly MessageType[] = Constants.NonSystemMessageTypes;

export interface BackfillOptions {
  /** この時刻以降のメッセージを数える。null なら最初から */
  since: Date | null;
  /** この時刻より前のメッセージを数える（日本時間の日の始まり） */
  until: Date;
  dir: string;
}

interface Target {
  id: string;
  name: string;
  parent?: { id: string; name: string };
}

function jstDayStart(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`日付は YYYY-MM-DD で指定してください: ${date}`);
  return new Date(`${date}T00:00:00+09:00`);
}

/**
 * until の既定は今日（日本時間）の始まり。今日の分は本番の Bot がメモリ上で足し込んでいて、
 * 次の書き出しで上書きされてしまうので、今日より先は指定させない。
 */
export function parseBackfillArgs(argv: readonly string[], now: Date = new Date()): BackfillOptions {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const today = jstDayStart(jstDateHour(now).date);
  const sinceArg = value('--since');
  const untilArg = value('--until');
  const since = sinceArg ? jstDayStart(sinceArg) : null;
  const until = untilArg ? jstDayStart(untilArg) : today;
  if (until > today) throw new Error('--until に今日より先は指定できません（今日の分は Bot が集計中のため）');
  if (since && since >= until) throw new Error('--since は --until より前にしてください');
  return { since, until, dir: value('--dir') ?? config.activityDir };
}

/** REST のメッセージを集計の 1 件にする。参加メッセージやピン留めの通知などは null */
export function toMessageRecord(
  message: APIMessage,
  target: Target,
  displayNames: ReadonlyMap<string, string>,
): MessageRecord | null {
  if (!NON_SYSTEM_TYPES.includes(message.type)) return null;
  const mentioned = new Set(message.mentions.filter(user => !user.bot).map(user => user.id));
  const replied = message.referenced_message?.author;
  if (message.type === MessageType.Reply && replied && !replied.bot) mentioned.add(replied.id);
  const author = message.author;
  return {
    at: new Date(message.timestamp),
    channelId: target.id,
    channelName: target.name,
    ...(target.parent ? { parent: target.parent } : {}),
    author: {
      id: author.id,
      username: author.username,
      displayName: displayNames.get(author.id) ?? author.global_name ?? author.username,
    },
    isBot: Boolean(author.bot) || message.webhook_id != null,
    roles: [],
    mentionedUsers: [...mentioned],
    mentionedRoles: message.mention_roles.length,
    mentionsEveryone: message.mention_everyone,
  };
}

/** 新しい順に since まで読む */
async function* channelMessages(rest: REST, channelId: string, since: Date | null): AsyncGenerator<APIMessage> {
  let before: string | undefined;
  for (;;) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    const page = await rest.get(Routes.channelMessages(channelId), { query }) as APIMessage[];
    const last = page[page.length - 1];
    if (!last) return;
    for (const message of page) {
      if (since && new Date(message.timestamp) < since) return;
      yield message;
    }
    before = last.id;
  }
}

async function archivedThreads(
  rest: REST,
  channelId: string,
  kind: 'public' | 'private',
  since: Date | null,
): Promise<APIThreadChannel[]> {
  const threads: APIThreadChannel[] = [];
  let before: string | undefined;
  for (;;) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    const page = await rest.get(Routes.channelThreads(channelId, kind), { query }) as {
      threads: APIThreadChannel[];
      has_more: boolean;
    };
    threads.push(...page.threads);
    const archivedAt = page.threads[page.threads.length - 1]?.thread_metadata?.archive_timestamp;
    // アーカイブ日時の新しい順に返るので、since より前にアーカイブされたスレッドから先は見なくてよい
    if (!page.has_more || !archivedAt || (since && new Date(archivedAt) < since)) return threads;
    before = archivedAt;
  }
}

/** ユーザー ID → サーバーでの表示名。Server Members Intent が無いと取れないので、そのときは空 */
async function memberDisplayNames(rest: REST, guildId: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  let after = '0';
  try {
    for (;;) {
      const query = new URLSearchParams({ limit: '1000', after });
      const page = await rest.get(Routes.guildMembers(guildId), { query }) as APIGuildMember[];
      for (const member of page) {
        if (!member.user) continue;
        names.set(member.user.id, member.nick ?? member.user.global_name ?? member.user.username);
        after = member.user.id;
      }
      if (page.length < 1000) return names;
    }
  } catch (e) {
    console.warn('メンバー一覧を取れなかったので、表示名はグローバルの名前で代用します:', e);
    return names;
  }
}

function isMissingAccess(e: unknown): boolean {
  return e instanceof DiscordAPIError && (e.status === 403 || e.status === 404);
}

async function collectTargets(rest: REST, guildId: string, since: Date | null): Promise<Target[]> {
  const channels = await rest.get(Routes.guildChannels(guildId)) as { id: string; type: ChannelType; name: string }[];
  const names = new Map(channels.map(channel => [channel.id, channel.name]));
  const targets: Target[] = channels
    .filter(channel => MESSAGE_CHANNEL_TYPES.includes(channel.type))
    .map(channel => ({ id: channel.id, name: channel.name }));

  const threads = new Map<string, APIThreadChannel>();
  const active = await rest.get(Routes.guildActiveThreads(guildId)) as { threads: APIThreadChannel[] };
  for (const thread of active.threads) threads.set(thread.id, thread);
  for (const channel of channels.filter(c => THREAD_PARENT_TYPES.includes(c.type))) {
    for (const kind of ['public', 'private'] as const) {
      try {
        for (const thread of await archivedThreads(rest, channel.id, kind, since)) threads.set(thread.id, thread);
      } catch (e) {
        // 非公開スレッドはスレッド管理の権限が無いと読めない。読めるぶんだけで続ける
        if (!isMissingAccess(e)) throw e;
      }
    }
  }
  for (const thread of threads.values()) {
    const parentId = thread.parent_id;
    targets.push({
      id: thread.id,
      name: thread.name,
      ...(parentId ? { parent: { id: parentId, name: names.get(parentId) ?? parentId } } : {}),
    });
  }
  return targets;
}

export async function backfill(options: BackfillOptions): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const store = new ActivityStore(options.dir);
  const sinceDate = options.since ? jstDateHour(options.since).date : '';
  const untilDate = jstDateHour(options.until).date;

  for (const date of store.savedDates()) {
    if (date >= sinceDate && date < untilDate) store.resetMessages(date);
  }
  store.flush();

  const displayNames = await memberDisplayNames(rest, config.guildId);
  const targets = await collectTargets(rest, config.guildId, options.since);
  console.log(`${targets.length} チャンネル・スレッドを読みます（メンバー ${displayNames.size} 人の表示名を取得済み）`);

  let total = 0;
  for (const target of targets) {
    let count = 0;
    try {
      for await (const message of channelMessages(rest, target.id, options.since)) {
        if (new Date(message.timestamp) >= options.until) continue;
        const record = toMessageRecord(message, target, displayNames);
        if (!record) continue;
        store.recordMessage(record);
        count += 1;
      }
    } catch (e) {
      if (!isMissingAccess(e)) throw e;
      console.warn(`#${target.name}: 読む権限が無いので飛ばします`);
    }
    store.flush();
    if (count > 0) console.log(`#${target.name}: ${count} 件`);
    total += count;
  }
  console.log(`完了: ${total} 件（${sinceDate || '最初'} 〜 ${untilDate} の前日まで）`);
}

if (require.main === module) {
  if (!config.discordToken || !config.guildId) {
    console.error('DISCORD_TOKEN と GUILD_ID を .env に設定してください');
    process.exit(1);
  }
  let options: BackfillOptions;
  try {
    options = parseBackfillArgs(process.argv.slice(2));
  } catch (e) {
    // 引数の誤りはスタックトレースではなく理由だけを出す
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  backfill(options).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
