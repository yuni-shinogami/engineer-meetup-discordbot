import { RepliableInteraction, GuildMember, APIInteractionGuildMember } from 'discord.js';
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

export function memberHasOperatorRole(
  member: GuildMember | APIInteractionGuildMember | null,
): boolean {
  if (member instanceof GuildMember) {
    return member.roles.cache.has(config.operatorRoleId);
  }
  if (member) {
    return (member as APIInteractionGuildMember).roles.includes(config.operatorRoleId);
  }
  return false;
}

export async function requireOperatorRole(
  interaction: RepliableInteraction,
  message = '❌ このコマンドを実行する権限がありません。',
): Promise<boolean> {
  if (memberHasOperatorRole(interaction.member)) return true;
  await interaction.reply({ content: message, ephemeral: true });
  return false;
}
