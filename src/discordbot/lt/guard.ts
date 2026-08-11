import { RepliableInteraction } from 'discord.js';
import { formatMeetupDate } from './dates';
import { ltStore } from './store';
import { LtEntry } from './types';

interface GuardOptions {
  /** 日程が確定済みの場合に操作を拒否するか（希望日の変更は拒否、動画の予定は変更を許す） */
  requireUnscheduled?: boolean;
}

/**
 * フォーラムポスト内のコンポーネント操作に共通する検証。
 * レコードを引き当て、応募者本人であることを確認する。
 * 拒否した場合は理由を ephemeral で返し、null を返す。
 */
export async function resolveSpeakerEntry(
  interaction: RepliableInteraction,
  threadId: string | undefined,
  { requireUnscheduled = false }: GuardOptions = {},
): Promise<LtEntry | null> {
  const entry = threadId ? ltStore.get(threadId) : undefined;

  if (!entry) {
    await interaction.reply({
      content: '❌ この応募のレコードが見つかりません。運営に連絡してください。',
      ephemeral: true,
    });
    return null;
  }

  if (interaction.user.id !== entry.speakerId) {
    await interaction.reply({
      content: `❌ ここを操作できるのは応募者本人（<@${entry.speakerId}>）のみです。`,
      ephemeral: true,
    });
    return null;
  }

  if (requireUnscheduled && entry.eventDate) {
    await interaction.reply({
      content: `ℹ️ 日程は既に **${formatMeetupDate(entry.eventDate)}** で確定しています。変更したい場合は運営に連絡してください。`,
      ephemeral: true,
    });
    return null;
  }

  return entry;
}
