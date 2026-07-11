import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { executePreAnnounce } from '../meetup';
import { requireOperatorRole, formatError } from './utils';

export const preAnnounceCommand = new SlashCommandBuilder()
  .setName('pre-announce')
  .setDescription('エンジニア集会の事前告知をXに投稿します（木曜19時に自動実行されます）')
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番環境で実行する場合はTrueにしてください（デフォルトはFalse: テストモード）')
  );

export async function handlePreAnnounceCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply();

  const isProd = interaction.options.getBoolean('production') ?? false;

  try {
    await interaction.editReply(`事前告知を投稿しています (${isProd ? '🚀本番' : '🧪テスト'}モード)...`);
    const postUrl = await executePreAnnounce(isProd);
    await interaction.editReply(`✅ 事前告知を投稿しました！ (${isProd ? '本番' : 'テスト'})\n\n**投稿URL:** ${postUrl}`);
  } catch (error) {
    console.error('handlePreAnnounceCommand failed:', error);
    await interaction.editReply(formatError(error));
  }
}
