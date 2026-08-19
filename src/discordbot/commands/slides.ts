import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { buildSlidesAttachment, slidesMessage, SlidesFormat } from '../slides';
import { requireOperatorRole, formatError } from './utils';

export const slidesCommand = new SlashCommandBuilder()
  .setName('slides')
  .setDescription('司会進行スライドを Canva から取得します')
  .addStringOption(option =>
    option.setName('format')
      .setDescription('配布形式（既定: webm）')
      .addChoices(
        { name: 'webm（VRChatで再生用）', value: 'webm' },
        { name: 'pdf（手元で読む用）', value: 'pdf' },
      ),
  );

export async function handleSlidesCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  // Canva のエクスポートと動画化で数十秒かかる。3 秒の応答期限に間に合わないので defer する。
  await interaction.deferReply();

  const format = (interaction.options.getString('format') ?? 'webm') as SlidesFormat;

  try {
    await interaction.editReply(format === 'webm'
      ? 'Canva から取得して動画に変換しています...'
      : 'Canva から司会進行スライドを取得しています...');
    const { attachment, sizeMb } = await buildSlidesAttachment(format);
    await interaction.editReply({ content: slidesMessage(sizeMb, format), files: [attachment] });
  } catch (error) {
    console.error('handleSlidesCommand failed:', error);
    await interaction.editReply(formatError(error));
  }
}
