import { SlashCommandBuilder, ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { config } from '../config';
import { storage } from '../storage';
import { CONFIRM_MEETUP_YES, sendConfirmMeetupToChannel } from '../meetup';
import { requireOperatorRole, formatError } from './utils';

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

  const answer = isYes ? 'YES (開催する)' : 'NO (開催しない)';
  const result = isYes ? '木曜19時に事前告知を自動投稿します。' : '今週の自動告知は行いません。';

  await interaction.update({
    content: `【確認】今週エンジニア集会やる？\n→ **${answer}** が選択されました。${result}\n\n<@${interaction.user.id}> が選択しました。`,
    components: [],
  });
}
