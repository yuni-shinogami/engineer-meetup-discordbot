import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { generateImage } from '../../image-gen/generate';
import { requireOperatorRole, formatError } from './utils';

export const generateLtImageCommand = new SlashCommandBuilder()
  .setName('generate-lt-image')
  .setDescription('LT告知画像を生成します')
  .addStringOption(option =>
    option.setName('title').setDescription('LTタイトル').setRequired(true)
  )
  .addStringOption(option =>
    option.setName('speaker-name').setDescription('スピーカー名').setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('month').setDescription('開催月（例: 6）').setRequired(true).setMinValue(1).setMaxValue(12)
  )
  .addIntegerOption(option =>
    option.setName('day').setDescription('開催日（例: 27）').setRequired(true).setMinValue(1).setMaxValue(31)
  )
  .addAttachmentOption(option =>
    option.setName('speaker-icon').setDescription('スピーカーアイコン画像').setRequired(true)
  )
  .addAttachmentOption(option =>
    option.setName('title-slide').setDescription('タイトルスライド画像').setRequired(true)
  );

async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') ?? 'image/png';
  const mimeType = contentType.split(';')[0]?.trim() ?? 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function handleGenerateLtImageCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply();

  const title = interaction.options.getString('title', true);
  const speakerName = interaction.options.getString('speaker-name', true);
  const month = interaction.options.getInteger('month', true);
  const day = interaction.options.getInteger('day', true);
  const eventDate = `${month}月${day}日`;
  const speakerIconAttachment = interaction.options.getAttachment('speaker-icon', true);
  const titleSlideAttachment = interaction.options.getAttachment('title-slide', true);

  try {
    await interaction.editReply('画像を生成しています...');

    const [speakerIcon, titleSlideImage] = await Promise.all([
      fetchAsDataUrl(speakerIconAttachment.url),
      fetchAsDataUrl(titleSlideAttachment.url),
    ]);

    const imageBuffer = await generateImage({
      template: 'lt-announce',
      title,
      speakerName,
      speakerIcon,
      eventDate,
      titleSlideImage,
    });

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'lt-announce.png' });
    await interaction.editReply({ content: '✅ LT告知画像を生成しました！', files: [attachment] });
  } catch (error) {
    console.error('handleGenerateLtImageCommand failed:', error);
    await interaction.editReply(formatError(error));
  }
}
