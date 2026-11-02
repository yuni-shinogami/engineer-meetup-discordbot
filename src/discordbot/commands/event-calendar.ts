import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { callVrceve, deleteFromVrceve, isVrceveConfigured, registerOnVrceve } from '../vrceve';
import { requireOperatorRole, formatError } from './utils';

/**
 * VRChat イベントカレンダーへの登録を、開催確認とは別に手で動かす。
 * 開催確認の YES より前に登録したい・登録に失敗したので出し直したい・VM のログインを確かめたい、といったとき用。
 */
export const eventCalendarCommand = new SlashCommandBuilder()
  .setName('event-calendar')
  .setDescription('次の集会を VRChat イベントカレンダーに登録・削除します（開催確認の YES でも自動で登録されます）')
  .addStringOption(option =>
    option.setName('action')
      .setDescription('やること（デフォルト: 登録）')
      .addChoices(
        { name: '登録', value: 'register' },
        { name: '削除', value: 'delete' },
        { name: 'ログインの確認', value: 'check' },
      )
  )
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番で実行する場合はTrue（デフォルトはFalse: 送信せずに入力した画面だけを返す）')
  );

export async function handleEventCalendarCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  if (!isVrceveConfigured()) {
    await interaction.reply({
      content: '❌ VRChat イベントカレンダーの登録が設定されていません（`VRCEVE_SSH_KEY` / `VRCEVE_SSH_TARGET`）。',
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply();

  const action = interaction.options.getString('action') ?? 'register';
  const isProd = interaction.options.getBoolean('production') ?? false;
  try {
    if (action === 'check') {
      const result = await callVrceve<{ account: string }>('check');
      await interaction.editReply(`✅ デスクトップ VM の Chrome は ${result.account} でログインしています。`);
      return;
    }
    if (action === 'delete') {
      // テストでは送っていないので、消すものがない
      const report = isProd ? await deleteFromVrceve() : null;
      await interaction.editReply(report?.content
        ?? (isProd ? 'ℹ️ 今週は VRChat イベントカレンダーに登録していません。' : 'ℹ️ テストでは登録していないので、削除するものはありません。'));
      return;
    }
    const report = await registerOnVrceve(isProd);
    await interaction.editReply({ content: report?.content ?? '❌ 登録できませんでした。', files: report?.files ?? [] });
  } catch (error) {
    console.error('handleEventCalendarCommand failed:', error);
    await interaction.editReply(formatError(error));
  }
}
