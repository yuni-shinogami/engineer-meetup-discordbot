import { ChatInputCommandInteraction, GuildMember, APIInteractionGuildMember } from 'discord.js';
import { CronExpressionParser } from 'cron-parser';
import { config } from '../config';

export function formatNextRun(cronExpr: string): string {
  try {
    const next = CronExpressionParser.parse(cronExpr, { tz: 'Asia/Tokyo' }).next().toDate();
    return next.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '(解析失敗)';
  }
}

export function formatError(error: unknown, maxLength = 1800): string {
  const msg = error instanceof Error ? error.message : String(error);
  const prefix = '❌ エラーが発生しました: ';
  const truncated = msg.length > maxLength ? msg.slice(0, maxLength) + '…' : msg;
  return prefix + truncated;
}

export async function requireOperatorRole(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const member = interaction.member;
  let hasRole = false;
  if (member instanceof GuildMember) {
    hasRole = member.roles.cache.has(config.operatorRoleId);
  } else if (member) {
    hasRole = (member as APIInteractionGuildMember).roles.includes(config.operatorRoleId);
  }
  if (!hasRole) {
    await interaction.reply({ content: '❌ このコマンドを実行する権限がありません。', ephemeral: true });
    return false;
  }
  return true;
}
