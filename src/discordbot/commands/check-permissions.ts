import { SlashCommandBuilder, ChatInputCommandInteraction, TextChannel, PermissionFlagsBits } from 'discord.js';
import { config } from '../config';
import { requireOperatorRole } from './utils';

export const checkPermissionsCommand = new SlashCommandBuilder()
  .setName('check-permissions')
  .setDescription('Botが各チャンネルで必要な権限を持っているか確認します');

const REQUIRED_PERMISSIONS = [
  { flag: PermissionFlagsBits.ViewChannel,      label: 'ViewChannel（閲覧）',             required: true  },
  { flag: PermissionFlagsBits.SendMessages,     label: 'SendMessages（メッセージ送信）',  required: true  },
  { flag: PermissionFlagsBits.EmbedLinks,       label: 'EmbedLinks（リンク埋め込み）',    required: false },
  { flag: PermissionFlagsBits.MentionEveryone,  label: 'MentionEveryone（ロールping）',   required: false },
] as const;

export async function handleCheckPermissionsCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply({ ephemeral: true });

  const ok = '✅';
  const ng = '❌';
  const warn = '⚠️';

  const targets = [
    { label: '運営チャンネル',         id: config.operationsChannelId },
    { label: 'お知らせチャンネル（本番）', id: config.publicChannelId },
    { label: 'テストチャンネル',        id: config.testChannelId },
  ];

  const sections: string[] = ['🔐 **Bot権限チェック**', ''];

  for (const { label, id } of targets) {
    if (!id) {
      sections.push(`${ng} **${label}**: 未設定`);
      sections.push('');
      continue;
    }

    let channelLines: string[];
    try {
      const channel = await interaction.client.channels.fetch(id) as TextChannel;
      const botMember = channel.guild.members.me;
      if (!botMember) {
        sections.push(`${ng} **${label}** <#${id}>: Bot のメンバー情報を取得できませんでした`);
        sections.push('');
        continue;
      }

      const perms = channel.permissionsFor(botMember);
      channelLines = REQUIRED_PERMISSIONS.map(({ flag, label: permLabel, required }) => {
        const has = perms?.has(flag) ?? false;
        const icon = has ? ok : (required ? ng : warn);
        return `　${icon} ${permLabel}`;
      });

      sections.push(`${ok} **${label}** <#${id}>`);
    } catch {
      sections.push(`${ng} **${label}** <#${id}>: チャンネル取得失敗`);
      sections.push('');
      continue;
    }

    sections.push(...channelLines);
    sections.push('');
  }

  sections.push('凡例: ✅ OK　❌ 不足（必須）　⚠️ 不足（推奨）');

  await interaction.editReply(sections.join('\n'));
}
