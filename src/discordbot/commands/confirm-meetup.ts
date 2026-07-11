import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { config } from '../config';
import { sendConfirmMeetupToChannel } from '../meetup';
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
