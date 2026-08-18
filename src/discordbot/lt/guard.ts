import { RepliableInteraction } from 'discord.js';
import { memberHasOperatorRole } from '../commands/utils';
import { formatMeetupDate } from './dates';
import { ltStore } from './store';
import { LtEntry } from './types';

interface GuardOptions {
  /** 日程が確定済みの場合に操作を拒否するか（希望日の変更は拒否、動画の予定は変更を許す） */
  requireUnscheduled?: boolean;
  /** 運営による代理入力を許すか（タイトルや X アカウントを口頭で聞いた場合に使う） */
  allowOperator?: boolean;
}

/** レコードを引き当てる。見つからなければ理由を ephemeral で返して null。 */
async function resolveEntry(
  interaction: RepliableInteraction,
  threadId: string | undefined,
): Promise<LtEntry | null> {
  const entry = threadId ? ltStore.get(threadId) : undefined;
  if (entry) return entry;

  await interaction.reply({
    content: '❌ この応募のレコードが見つかりません。運営に連絡してください。',
    ephemeral: true,
  });
  return null;
}

/**
 * フォーラムポスト内のコンポーネント操作に共通する検証。
 * レコードを引き当て、応募者本人であることを確認する。
 * 拒否した場合は理由を ephemeral で返し、null を返す。
 */
export async function resolveSpeakerEntry(
  interaction: RepliableInteraction,
  threadId: string | undefined,
  { requireUnscheduled = false, allowOperator = false }: GuardOptions = {},
): Promise<LtEntry | null> {
  const entry = await resolveEntry(interaction, threadId);
  if (!entry) return null;

  const permitted = interaction.user.id === entry.speakerId
    || (allowOperator && memberHasOperatorRole(interaction.member));
  if (!permitted) {
    await interaction.reply({
      content: `❌ ここを操作できるのは応募者本人（<@${entry.speakerId}>）${allowOperator ? 'と運営' : ''}のみです。`,
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

/**
 * 運営専用の操作（日程の確定・取り消し）に共通する検証。
 * ボタン自体は登壇者にも見えているので、ここで弾かないと本人が自分の日程を確定できてしまう。
 */
export async function resolveOperatorEntry(
  interaction: RepliableInteraction,
  threadId: string | undefined,
): Promise<LtEntry | null> {
  const entry = await resolveEntry(interaction, threadId);
  if (!entry) return null;

  if (!memberHasOperatorRole(interaction.member)) {
    await interaction.reply({
      content: '❌ 日程の確定・取り消しは運営のみが行えます。希望日の相談はポスト内のメニューからお願いします。',
      ephemeral: true,
    });
    return null;
  }

  return entry;
}
