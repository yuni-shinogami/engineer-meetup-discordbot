import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from './config';
import { storage } from './storage';
import { postAnnouncement } from '../x/postAnnouncement';

export async function sendConfirmMeetupToChannel(client: Client, channelId: string): Promise<void> {
  const channel = await client.channels.fetch(channelId) as TextChannel;
  if (!channel) throw new Error('チャンネルが見つかりません');

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_meetup_yes')
        .setLabel('YES (開催する)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('confirm_meetup_no')
        .setLabel('NO (開催しない)')
        .setStyle(ButtonStyle.Secondary),
    );

  await channel.send({
    content: '【運営確認】今週エンジニア集会やる？',
    components: [row],
  });
}

export async function executePreAnnounce(isProd: boolean): Promise<string> {
  const tweetId = await postAnnouncement(isProd);

  const xAccount = isProd ? config.xAccount : config.testXAccount;
  const postUrl = xAccount ? `https://x.com/${xAccount}/status/${tweetId}` : tweetId;

  storage.lastTweetId = tweetId;
  storage.preAnnouncePostUrl = postUrl;

  return postUrl;
}
