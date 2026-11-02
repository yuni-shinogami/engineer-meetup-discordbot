import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AttachmentBuilder,
  Client,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} from 'discord.js';
import { config } from './config';
import { storage } from './storage';
import { ltEntriesForMeetup, nextMeetupDate } from './lt/weekly-announce';
import { needsTitle, type LtEntry } from './lt/types';
import { jstToIso } from './vrc-event';
import { MEETUP_START_TIME, vrceveFields } from './vrceve';

/**
 * Discord のサーバーのイベント。以前は毎週の繰り返しで 1 つ作っていたが、開催しない週にも載ってしまうので、
 * 開催確認で YES になったらその週の分を作り、取りやめたら消す。中身は以前の毎週のイベントと同じ
 * （外部の場所「VRChat」、22:00〜翌 3:00、説明・画像）。LT がある週は、名前と説明に LT を足す（vrceve と共通の名前）。
 */

const LOCATION = 'VRChat';
/** 22:00 から翌 3:00 まで（集合写真・進捗共有会のあとの自由交流会まで含める） */
const DURATION_HOURS = 5;
const DESCRIPTION = [
  'オールジャンルのエンジニアが集まり交流ができるイベントです。',
  '23:00から進捗共有会があり、そこでは飲んだお酒や飲み物も進捗に数えてOKです！',
  '',
  '22:00 インスタンスオープン',
  '23:00 集合写真',
  '23:00 進捗共有会',
  '23:30～ 自由交流会',
].join('\n');
/** 以前の毎週のイベントの画像。リポジトリの assets/ に置いている */
const IMAGE_PATH = join(__dirname, '../../assets/discord-event.png');

export interface DiscordEventFields {
  name: string;
  description: string;
  /** UTC の ISO 8601 */
  startsAt: string;
  endsAt: string;
}

export function discordEventFields(eventDate: string, lts: LtEntry[]): DiscordEventFields {
  const startsAt = jstToIso(eventDate, MEETUP_START_TIME);
  const ltLines = lts.map(entry =>
    `・${needsTitle(entry.title) ? '（タイトル未定）' : `「${entry.title}」`} / ${entry.speakerName}`);
  return {
    name: vrceveFields(eventDate, lts).name,
    description: ltLines.length > 0 ? `${DESCRIPTION}\n\n【今週の LT】\n${ltLines.join('\n')}` : DESCRIPTION,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + DURATION_HOURS * 3_600_000).toISOString(),
  };
}

export interface DiscordEventReport {
  content: string;
  files?: AttachmentBuilder[];
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /Missing Permissions/i.test(message)
    ? `${message}（Bot のロールに「イベントの作成」か「イベントの管理」の権限が必要です）`
    : message;
}

/**
 * 次の開催日の Discord のイベントを作る。作成済みなら作らない（YES を押し直したときなど）。
 * テストでは作らずに、作る内容と画像を返す（Discord のイベントはサーバーの全員に見えてしまうため）。
 */
export async function registerDiscordEvent(client: Client, isProd: boolean, now: Date = new Date()): Promise<DiscordEventReport> {
  if (isProd && storage.discordEventId) {
    return { content: '📅 Discord のイベントは作成済みです。' };
  }
  const eventDate = nextMeetupDate(now);
  const fields = discordEventFields(eventDate, ltEntriesForMeetup(eventDate, isProd));
  if (!isProd) {
    return {
      content: [
        `🧪 Discord のイベント（テストなので作っていません）: **${fields.name}**（${eventDate} 22:00〜翌3:00、場所: ${LOCATION}）`,
        '```',
        fields.description,
        '```',
      ].join('\n'),
      files: [new AttachmentBuilder(IMAGE_PATH, { name: 'discord-event.png' })],
    };
  }
  try {
    const guild = await client.guilds.fetch(config.guildId);
    const event = await guild.scheduledEvents.create({
      name: fields.name,
      description: fields.description,
      scheduledStartTime: fields.startsAt,
      scheduledEndTime: fields.endsAt,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: LOCATION },
      image: readFileSync(IMAGE_PATH),
    });
    storage.discordEventId = event.id;
    return { content: `📅 Discord のイベントを作りました: **${fields.name}**（${eventDate} 22:00〜）\n${event.url}` };
  } catch (error) {
    console.error('registerDiscordEvent failed:', error);
    return { content: `❌ Discord のイベントを作れませんでした: ${errorText(error)}` };
  }
}

/** 開催を取りやめたとき、作ったイベントを消す。作っていなければ null。 */
export async function deleteDiscordEvent(client: Client): Promise<string | null> {
  const eventId = storage.discordEventId;
  if (!eventId) return null;
  try {
    const guild = await client.guilds.fetch(config.guildId);
    await guild.scheduledEvents.delete(eventId);
    storage.discordEventId = null;
    return '🗑️ Discord のイベントから今週の集会を削除しました。';
  } catch (error) {
    console.error('deleteDiscordEvent failed:', error);
    return `❌ Discord のイベントを削除できませんでした: ${errorText(error)}\nサーバーの「イベント」から手で削除してください。`;
  }
}
