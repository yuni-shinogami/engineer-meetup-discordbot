import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { existsSync } from 'fs';
import { config, ltForumChannelId } from '../config';
import { storage } from '../storage';
import { CRON_SCHEDULES } from '../scheduler';
import { formatDateKey, formatMeetupDate } from '../lt/dates';
import { fetchLtForum } from '../lt/forum';
import { LT_STATUS_LABELS, resolveLtTags } from '../lt/status';
import { ltStore } from '../lt/store';
import { LT_STATUSES } from '../lt/types';
import { requireOperatorRole, formatNextRun } from './utils';

export const statusCommand = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Botの設定状態と今週のスケジュール状況を確認します');

export async function handleStatusCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply({ ephemeral: true });

  const ok = '✅';
  const ng = '❌';

  const xApiOk = process.env['X_API_KEY'] && process.env['TEST_X_API_KEY'];
  const xChecks = [
    `${xApiOk ? ok : ng} X API 認証情報: ${xApiOk ? '設定済み' : '未設定 (X_API_KEY / TEST_X_API_KEY)'}`,
  ];

  const vrcStateOk = config.vrcStateDir && existsSync(config.vrcStateDir);
  const vrcChecks = [
    `${vrcStateOk ? ok : ng} VRChat 統合 (VRC_STATE_DIR): \`${config.vrcStateDir || '未設定'}\``,
  ];

  const channelChecks = await Promise.all([
    { label: '運営チャンネル', id: config.operationsChannelId },
    { label: 'お知らせチャンネル（本番）', id: config.publicChannelId },
    { label: 'テストチャンネル', id: config.testChannelId },
  ].map(async ({ label, id }) => {
    if (!id) return `${ng} ${label}: 未設定`;
    try {
      const ch = await interaction.client.channels.fetch(id);
      return `${ch ? ok : ng} ${label}: <#${id}>`;
    } catch {
      return `${ng} ${label}: <#${id}> (取得失敗)`;
    }
  }));

  const ltForumChecks = await Promise.all([true, false].map(async (isProd) => {
    const label = isProd ? 'LTフォーラム（本番）' : 'LTフォーラム（テスト）';
    const id = ltForumChannelId(isProd);
    if (!id) return `${ng} ${label}: 未設定`;
    try {
      const forum = await fetchLtForum(interaction.client, isProd);
      const { missing } = resolveLtTags(forum);
      if (missing.length > 0) {
        const names = missing.map(s => `「${LT_STATUS_LABELS[s]}」`).join('、');
        return `${ng} ${label}: <#${id}> タグ不足 → ${names}`;
      }
      return `${ok} ${label}: <#${id}> タグ6種OK`;
    } catch (error) {
      return `${ng} ${label}: <#${id}> ${error instanceof Error ? error.message : '取得失敗'}`;
    }
  }));

  const entries = ltStore.list();
  const activeCounts = LT_STATUSES
    .filter(status => status !== 'done' && status !== 'cancelled')
    .map(status => `${LT_STATUS_LABELS[status]} ${entries.filter(e => e.status === status).length}件`);

  const today = formatDateKey(new Date());
  const upcoming = entries
    .filter(e => e.eventDate && e.eventDate >= today && e.status !== 'cancelled')
    .sort((a, b) => a.eventDate!.localeCompare(b.eventDate!))
    .slice(0, 5)
    .map(e => `　${formatMeetupDate(e.eventDate!)} ${e.speakerName}「${e.title}」`
      + `（${LT_STATUS_LABELS[e.status]}）`);

  const lines = [
    '📊 **システム状態**',
    '',
    '**今週のスケジュール**',
    `・開催予定: ${storage.isScheduled ? `${ok} YES（木曜19時に事前告知を自動投稿）` : `${ng} NO（未設定 or キャンセル済み）`}`,
    `・事前告知URL: ${storage.preAnnouncePostUrl ?? '未投稿（/pre-announce で投稿）'}`,
    `・招待URL: ${storage.lastInviteUrl ?? '未設定（/create-instance で発行）'}`,
    '',
    '**X (Twitter) 統合**',
    ...xChecks,
    '',
    '**VRChat 統合**',
    ...vrcChecks,
    '',
    '**チャンネル確認**',
    ...channelChecks,
    '',
    '**LT 応募**',
    ...ltForumChecks,
    `・進行中: ${activeCounts.join(' / ')}（全 ${entries.length} 件）`,
    upcoming.length ? `・確定済みの登壇:\n${upcoming.join('\n')}` : '・確定済みの登壇: なし',
    '',
    '**自動実行スケジュール**',
    ...CRON_SCHEDULES.map(({ label, expr, description }) =>
      `・${label} \`${expr}\`\n　次回: ${formatNextRun(expr)}　${description}`
    ),
  ];

  await interaction.editReply(lines.join('\n'));
}
