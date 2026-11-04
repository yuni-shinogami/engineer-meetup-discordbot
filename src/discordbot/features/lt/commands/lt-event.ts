import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { formatDateKey, formatMeetupDate } from '../../../shared/meetup-dates';
import { formatError, requireOperatorRole } from '../../../shared/interaction';
import {
  describeLtEvent,
  LtEvent,
  ltEventStore,
  LtEventStore,
  MAX_LT_EVENT_SLOTS,
  upcomingLtEvents,
  validateLtEvent,
} from '../events';
import { LtStore, ltStore } from '../store';
import { normalizeDateInput } from './lt-schedule';

const productionOption = (sub: SlashCommandSubcommandBuilder) =>
  sub.addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番の LT 会なら True（既定は False: テスト。テストの LT 会はテストの応募にだけ出ます）'));

const dateOption = (sub: SlashCommandSubcommandBuilder, description: string) =>
  sub.addStringOption(option => option.setName('date').setDescription(description).setRequired(true));

export const ltEventCommand = new SlashCommandBuilder()
  .setName('lt-event')
  .setDescription('LT 会（毎週の集会とは別の日に開く、複数人が登壇するイベント）を管理します')
  .addSubcommand(sub => productionOption(dateOption(sub.setName('create').setDescription('LT 会を作り、応募の候補日に出します'),
    '開催日（YYYY-MM-DD。例: 2026-11-21）')
    .addStringOption(option => option.setName('start').setDescription('開始時刻（HH:MM。例: 21:00）').setRequired(true))
    .addStringOption(option => option.setName('end').setDescription('終了時刻（HH:MM。例: 23:00）').setRequired(true))
    .addIntegerOption(option => option.setName('slots').setDescription('登壇の枠数')
      .setMinValue(1).setMaxValue(MAX_LT_EVENT_SLOTS).setRequired(true))
    .addStringOption(option => option.setName('theme').setDescription('テーマ').setMaxLength(100).setRequired(true))
    .addStringOption(option => option.setName('deadline').setDescription('応募の締切（YYYY-MM-DD）。この日まで応募の候補日に出します').setRequired(true))))
  .addSubcommand(sub => productionOption(sub.setName('show').setDescription('これから開く LT 会と応募の状況を見ます')))
  .addSubcommand(sub => productionOption(dateOption(sub.setName('edit').setDescription('LT 会の時刻・枠数・テーマ・締切を変えます（日付は変えられません）'),
    '変える LT 会の開催日（YYYY-MM-DD）')
    .addStringOption(option => option.setName('start').setDescription('開始時刻（HH:MM）'))
    .addStringOption(option => option.setName('end').setDescription('終了時刻（HH:MM）'))
    .addIntegerOption(option => option.setName('slots').setDescription('登壇の枠数').setMinValue(1).setMaxValue(MAX_LT_EVENT_SLOTS))
    .addStringOption(option => option.setName('theme').setDescription('テーマ').setMaxLength(100))
    .addStringOption(option => option.setName('deadline').setDescription('応募の締切（YYYY-MM-DD）'))))
  .addSubcommand(sub => productionOption(dateOption(sub.setName('cancel').setDescription('LT 会を取りやめ、応募の候補日から外します'),
    '取りやめる LT 会の開催日（YYYY-MM-DD）')));

function envLabel(isProd: boolean): string {
  return isProd ? '本番' : 'テスト';
}

/** 日付の入力を 'YYYY-MM-DD' にする。日程確定の手入力と同じく、2026/11/21 のような書き方も受ける。 */
function dateOf(raw: string): string | null {
  return normalizeDateInput(raw);
}

/** その LT 会の日に確定している応募と、その日を希望している（まだ確定していない）応募。 */
export function ltEventApplications(event: Pick<LtEvent, 'date' | 'isProd'>, store: LtStore = ltStore) {
  const scheduled = store.entriesOnDate(event.date, event.isProd);
  const wishing = store.list(event.isProd).filter(entry =>
    entry.eventDate === null && entry.status !== 'cancelled' && entry.preferredDates.includes(event.date));
  return { scheduled, wishing };
}

/** LT 会の状況の 1 件分（/lt-event show と /status で使う）。 */
export function describeLtEventStatus(event: LtEvent, now: Date = new Date(), store: LtStore = ltStore): string {
  const { scheduled, wishing } = ltEventApplications(event, store);
  const closed = event.applyDeadline < formatDateKey(now) ? '（応募は締め切り済み）' : '';
  const speakers = scheduled.length ? `\n　登壇: ${scheduled.map(entry => entry.speakerName).join('、')}` : '';
  return `・${describeLtEvent(event)}${closed}\n　確定 ${scheduled.length}/${event.slots} 枠・希望のみ ${wishing.length} 件${speakers}`;
}

async function handleCreate(interaction: ChatInputCommandInteraction, isProd: boolean, events: LtEventStore) {
  const date = dateOf(interaction.options.getString('date', true));
  const deadline = dateOf(interaction.options.getString('deadline', true));
  const input = {
    date: date ?? interaction.options.getString('date', true),
    isProd,
    startTime: interaction.options.getString('start', true).trim(),
    endTime: interaction.options.getString('end', true).trim(),
    slots: interaction.options.getInteger('slots', true),
    theme: interaction.options.getString('theme', true).trim(),
    applyDeadline: deadline ?? interaction.options.getString('deadline', true),
  };
  const errors = validateLtEvent(input);
  if (date && events.get(date, isProd)) {
    errors.push(`${formatMeetupDate(date)} の LT 会（${envLabel(isProd)}）は既にあります。変えるときは /lt-event edit を使ってください。`);
  }
  if (errors.length) {
    await interaction.reply({ content: ['⚠️ LT 会を作れませんでした。', ...errors.map(e => `・${e}`)].join('\n'), ephemeral: true });
    return;
  }
  const event = events.create(input);
  await interaction.reply({
    content: [
      `✅ LT 会（${envLabel(isProd)}）を作りました。`,
      describeLtEvent(event),
      `応募の締切まで、${envLabel(isProd)}の応募ポストの希望日の候補に出します。`
      + '（すでにある応募ポストのメニューは、次にポストが更新されたときに反映されます）',
    ].join('\n'),
    ephemeral: true,
  });
}

async function handleShow(interaction: ChatInputCommandInteraction, isProd: boolean, events: LtEventStore) {
  const upcoming = upcomingLtEvents(isProd, new Date(), events);
  const content = upcoming.length
    ? [`🎤 **これから開く LT 会（${envLabel(isProd)}）**`, ...upcoming.map(event => describeLtEventStatus(event))].join('\n')
    : `🎤 これから開く LT 会（${envLabel(isProd)}）はありません。/lt-event create で作れます。`;
  await interaction.reply({ content: content.slice(0, 2000), ephemeral: true });
}

async function handleEdit(interaction: ChatInputCommandInteraction, isProd: boolean, events: LtEventStore) {
  const date = dateOf(interaction.options.getString('date', true));
  const current = date ? events.get(date, isProd) : undefined;
  if (!date || !current || current.cancelled) {
    await interaction.reply({ content: `⚠️ その日の LT 会（${envLabel(isProd)}）が見つかりません。/lt-event show で確かめてください。`, ephemeral: true });
    return;
  }

  const rawDeadline = interaction.options.getString('deadline');
  const patch = {
    ...(interaction.options.getString('start') !== null && { startTime: interaction.options.getString('start', true).trim() }),
    ...(interaction.options.getString('end') !== null && { endTime: interaction.options.getString('end', true).trim() }),
    ...(interaction.options.getInteger('slots') !== null && { slots: interaction.options.getInteger('slots', true) }),
    ...(interaction.options.getString('theme') !== null && { theme: interaction.options.getString('theme', true).trim() }),
    ...(rawDeadline !== null && { applyDeadline: dateOf(rawDeadline) ?? rawDeadline }),
  };
  if (Object.keys(patch).length === 0) {
    await interaction.reply({ content: 'ℹ️ 変える項目（start・end・slots・theme・deadline）を 1 つ以上指定してください。', ephemeral: true });
    return;
  }

  const used = ltEventApplications(current).scheduled.length;
  const errors = validateLtEvent({ ...current, ...patch }, { used, checkDate: false });
  if (errors.length) {
    await interaction.reply({ content: ['⚠️ LT 会を変えられませんでした。', ...errors.map(e => `・${e}`)].join('\n'), ephemeral: true });
    return;
  }
  const event = events.update(date, isProd, patch);
  await interaction.reply({ content: `✅ LT 会（${envLabel(isProd)}）を変えました。\n${describeLtEvent(event)}`, ephemeral: true });
}

async function handleCancel(interaction: ChatInputCommandInteraction, isProd: boolean, events: LtEventStore) {
  const date = dateOf(interaction.options.getString('date', true));
  const current = date ? events.get(date, isProd) : undefined;
  if (!date || !current || current.cancelled) {
    await interaction.reply({ content: `⚠️ その日の LT 会（${envLabel(isProd)}）が見つかりません。/lt-event show で確かめてください。`, ephemeral: true });
    return;
  }
  events.update(date, isProd, { cancelled: true });

  const { scheduled } = ltEventApplications(current);
  const lines = [`✅ ${formatMeetupDate(date)} の LT 会（${envLabel(isProd)}）を取りやめ、応募の候補日から外しました。`];
  if (scheduled.length) {
    // 応募の確定は自動では外さない。登壇者への連絡と別の日への調整は運営が個別に行う
    lines.push(
      `⚠️ この日に確定している応募が ${scheduled.length} 件あります。各ポストで別の日に変えるか、確定を取り消してください。`,
      ...scheduled.map(entry => `・**${entry.speakerName}**（<#${entry.id}>）`),
    );
  }
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

/** /lt-event。運営限定。 */
export async function handleLtEventCommand(interaction: ChatInputCommandInteraction, events: LtEventStore = ltEventStore) {
  if (!await requireOperatorRole(interaction)) return;
  const isProd = interaction.options.getBoolean('production') ?? false;
  try {
    switch (interaction.options.getSubcommand()) {
      case 'create': return await handleCreate(interaction, isProd, events);
      case 'show': return await handleShow(interaction, isProd, events);
      case 'edit': return await handleEdit(interaction, isProd, events);
      case 'cancel': return await handleCancel(interaction, isProd, events);
    }
  } catch (error) {
    console.error('handleLtEventCommand failed:', error);
    const content = formatError(error);
    if (interaction.replied || interaction.deferred) await interaction.editReply(content);
    else await interaction.reply({ content, ephemeral: true });
  }
}
