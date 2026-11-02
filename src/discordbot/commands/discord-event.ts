import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { deleteDiscordEvent, registerDiscordEvent } from '../discord-event';
import { requireOperatorRole, formatError } from './utils';

/**
 * Discord のイベントの作成を、開催確認とは別に手で動かす。
 * 開催確認の YES より前に作りたい・作成に失敗したので出し直したい、といったとき用。
 */
export const discordEventCommand = new SlashCommandBuilder()
  .setName('discord-event')
  .setDescription('次の集会の Discord のイベントを作成・削除します（開催確認の YES でも自動で作られます）')
  .addStringOption(option =>
    option.setName('action')
      .setDescription('やること（デフォルト: 作成）')
      .addChoices(
        { name: '作成', value: 'register' },
        { name: '削除', value: 'delete' },
      )
  )
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番で実行する場合はTrue（デフォルトはFalse: 作らずに内容だけを返す）')
  );

export async function handleDiscordEventCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply();

  const action = interaction.options.getString('action') ?? 'register';
  const isProd = interaction.options.getBoolean('production') ?? false;
  try {
    if (action === 'delete') {
      const report = isProd ? await deleteDiscordEvent(interaction.client) : null;
      await interaction.editReply(report
        ?? (isProd ? 'ℹ️ 今週は Discord のイベントを作っていません。' : 'ℹ️ テストではイベントを作っていないので、削除するものはありません。'));
      return;
    }
    const report = await registerDiscordEvent(interaction.client, isProd);
    await interaction.editReply({ content: report.content, files: report.files ?? [] });
  } catch (error) {
    console.error('handleDiscordEventCommand failed:', error);
    await interaction.editReply(formatError(error));
  }
}
