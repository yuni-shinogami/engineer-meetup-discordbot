import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { config } from '../config';
import { storage } from '../storage';
import { requireOperatorRole, formatError } from './utils';
import { createInstance, AuthError } from '../../vrchat/createInstance';

export const createInstanceCommand = new SlashCommandBuilder()
  .setName('create-instance')
  .setDescription('VRChat インスタンスを作成し、招待URLを取得します（告知は行いません）')
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番環境で実行する場合はTrueにしてください（デフォルトはFalse: テストモード）')
  );

export async function handleCreateInstanceCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply();

  const isProd = interaction.options.getBoolean('production') ?? false;

  try {
    await interaction.editReply(`インスタンスを起動しています (${isProd ? '🚀本番' : '🧪テスト'}モード)...`);
    const inviteUrl = await createInstance(isProd, config.vrcStateDir);
    console.log(`Instance created: ${inviteUrl}`);

    storage.lastInviteUrl = inviteUrl;

    await interaction.editReply(`✅ インスタンスが作成されました！ (${isProd ? '本番' : 'テスト'})\n\n**招待URL:** ${inviteUrl}`);
  } catch (error) {
    console.error('handleCreateInstanceCommand failed:', error);
    if (error instanceof AuthError) {
      await interaction.editReply(`❌ VRChat 認証エラー: ${error.message}`);
    } else {
      await interaction.editReply(formatError(error));
    }
  }
}
