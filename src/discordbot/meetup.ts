import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from './config';
import { storage } from './storage';
import { postAnnouncement } from '../x/postAnnouncement';
import { xPostUrl } from '../x/postUrl';
import { buildCustomId } from './interactions';

/**
 * 開催確認ボタンの customId。
 * コロンを含まない旧形式だが、interactions.ts のディスパッチャが
 * 単一セグメントの ID を文字列全体のキーとして扱うため、
 * 既に投稿済みのボタンを壊さないようこのまま維持している。
 */
export const CONFIRM_MEETUP_YES = 'confirm_meetup_yes';
export const CONFIRM_MEETUP_NO = 'confirm_meetup_no';

/** 事前告知の時刻を過ぎてから開催が決まったときに出す「今すぐ投稿」ボタン。引数は prod / test。 */
export const LATE_PRE_ANNOUNCE_BUTTON = 'meetup:late-pre-announce';

export async function sendConfirmMeetupToChannel(client: Client, channelId: string): Promise<void> {
  const channel = await client.channels.fetch(channelId) as TextChannel;
  if (!channel) throw new Error('チャンネルが見つかりません');

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(CONFIRM_MEETUP_YES)
        .setLabel('YES (開催する)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(CONFIRM_MEETUP_NO)
        .setLabel('NO (開催しない)')
        .setStyle(ButtonStyle.Secondary),
    );

  await channel.send({
    content: '【運営確認】今週エンジニア集会やる？',
    components: [row],
  });
}

export function buildLatePreAnnounceRow(isProd: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(LATE_PRE_ANNOUNCE_BUTTON, isProd ? 'prod' : 'test'))
      .setLabel('今すぐ事前告知を投稿する')
      .setStyle(ButtonStyle.Primary),
  );
}

export async function executePreAnnounce(isProd: boolean): Promise<string> {
  const tweetId = await postAnnouncement(isProd);

  const postUrl = xPostUrl(tweetId, isProd);

  storage.lastTweetId = tweetId;
  storage.preAnnouncePostUrl = postUrl;
  storage.preAnnounceMissed = false;

  return postUrl;
}
