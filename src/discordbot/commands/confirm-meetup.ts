import { SlashCommandBuilder, ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { config } from '../config';
import { storage } from '../storage';
import { CONFIRM_MEETUP_YES, buildLatePreAnnounceRow, sendConfirmMeetupToChannel } from '../meetup';
import { triggerPreAnnounce } from '../scheduler';
import { requireOperatorRole, formatError } from './utils';
import { postSlidesToChannel } from '../slides';

export const confirmMeetupCommand = new SlashCommandBuilder()
  .setName('confirm-meetup')
  .setDescription('今週のエンジニア集会を開催するか確認します（YES/NOボタンを運営チャンネルに送信）')
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番チャンネルで実行する場合はTrueにしてください（デフォルトはFalse: テストチャンネル）')
  );

export async function handleConfirmMeetupCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply({ ephemeral: true });

  const isProd = interaction.options.getBoolean('production') ?? false;
  const channelId = isProd ? config.operationsChannelId : config.testChannelId;

  try {
    await sendConfirmMeetupToChannel(interaction.client, channelId);
    await interaction.editReply(`✅ 開催確認を送信しました。${isProd ? '運営チャンネル' : 'テストチャンネル'}を確認してください。`);
  } catch (error) {
    console.error('handleConfirmMeetupCommand failed:', error);
    await interaction.editReply(formatError(error));
  }
}

export async function handleConfirmMeetupButton(interaction: ButtonInteraction) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;

  const isYes = interaction.customId === CONFIRM_MEETUP_YES;
  storage.isScheduled = isYes;
  storage.confirmAnswered = true;

  // 事前告知の時刻（木19時）を過ぎてから YES になった週は自動投稿が走らないので、その場で投稿を促す
  const isLate = isYes && storage.preAnnounceMissed && !storage.preAnnouncePostUrl;

  const answer = isYes ? 'YES (開催する)' : 'NO (開催しない)';
  const result = !isYes
    ? '今週の自動告知は行いません。'
    : isLate
      ? '⚠️ 事前告知の時刻を過ぎているため自動投稿されません。下のボタンから投稿してください。'
      : '木曜19時に事前告知を自動投稿します。';

  await interaction.update({
    content: `【確認】今週エンジニア集会やる？\n→ **${answer}** が選択されました。${result}\n\n<@${interaction.user.id}> が選択しました。`,
    components: isLate ? [buildLatePreAnnounceRow(interaction.channelId !== config.testChannelId)] : [],
  });

  // 開催が決まった時点で司会進行スライドを配る。当日までに司会が中身を確認できるよう、
  // 事前告知（木19時）ではなくここに置いている。失敗は postSlidesToChannel 側で握るので、開催確認の応答は妨げない。
  if (isYes && config.canvaAutoPostSlides && interaction.channelId) {
    await postSlidesToChannel(interaction.client, interaction.channelId);
  }
}

export async function handleLatePreAnnounceButton(interaction: ButtonInteraction, args: string[]) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;

  const isProd = args[0] === 'prod';
  const base = interaction.message.content;

  // ボタンを押すまでの間に NO へ変えた、/pre-announce で手動投稿した、といった場合に二重投稿しない
  const skipReason = !storage.isScheduled
    ? '今週の開催予定が取り消されているため投稿しませんでした。'
    : storage.preAnnouncePostUrl
      ? `事前告知は投稿済みです。\n${storage.preAnnouncePostUrl}`
      : null;
  if (skipReason) {
    await interaction.update({ content: `${base}\n\nℹ️ ${skipReason}`, components: [] });
    return;
  }

  await interaction.update({
    content: `${base}\n\n⏳ <@${interaction.user.id}> が事前告知を投稿しています…`,
    components: [],
  });
  // 結果（投稿 URL・失敗・LT 告知）は定期実行と同じく運営チャンネルに流れる
  await triggerPreAnnounce(interaction.client, isProd);
  await interaction.editReply({
    content: storage.preAnnouncePostUrl
      ? `${base}\n\n✅ <@${interaction.user.id}> が事前告知を投稿しました。\n${storage.preAnnouncePostUrl}`
      : `${base}\n\n❌ 事前告知の投稿に失敗しました。\`/pre-announce\` で再実行してください。`,
  });
}
