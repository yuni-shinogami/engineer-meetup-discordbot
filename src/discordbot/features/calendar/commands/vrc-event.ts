import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { deleteVrcEvent, registerVrcEvent } from '../vrc-event';
import { requireOperatorRole, formatError } from '../../../shared/interaction';

/**
 * VRChat のグループのイベント（VRChat の「イベント」に載るカレンダー）への登録を、開催確認とは別に手で動かす。
 * 開催確認の YES より前に登録したい・登録に失敗したので出し直したい、といったとき用。
 */
export const vrcEventCommand = new SlashCommandBuilder()
  .setName('vrc-event')
  .setDescription('次の集会を VRChat のグループのイベントに登録・削除します（開催確認の YES でも自動で登録されます）')
  .addStringOption(option =>
    option.setName('action')
      .setDescription('やること（デフォルト: 登録）')
      .addChoices(
        { name: '登録', value: 'register' },
        { name: '削除', value: 'delete' },
      )
  )
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番で実行する場合はTrue（デフォルトはFalse: テスト用のグループにグループ内だけで作る）')
  );

export async function handleVrcEventCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply();

  const action = interaction.options.getString('action') ?? 'register';
  const isProd = interaction.options.getBoolean('production') ?? false;
  try {
    if (action === 'delete') {
      // テストのイベントは控えを残していないので、消せるのは本番で作った今週のイベントだけ
      const report = isProd ? await deleteVrcEvent() : null;
      await interaction.editReply(report
        ?? (isProd
          ? 'ℹ️ 今週は VRChat のグループのイベントを作っていません。'
          : 'ℹ️ テスト用のグループのイベントは控えを残していないので、VRChat から手で削除してください。'));
      return;
    }
    await interaction.editReply(await registerVrcEvent(isProd));
  } catch (error) {
    console.error('handleVrcEventCommand failed:', error);
    await interaction.editReply(formatError(error));
  }
}
