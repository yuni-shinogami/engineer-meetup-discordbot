import {
  ActionRowBuilder,
  ButtonInteraction,
  LabelBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  RepliableInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
} from 'discord.js';
import { config } from '../config';
import { buildCustomId } from '../interactions';
import { postAnnounceImage, syncAnnounceImage } from '../lt/announce-image';
import { formatDateKey, formatMeetupDate, parseDateKey, upcomingMeetupDates } from '../lt/dates';
import { applyLtEntryToPost, fetchLtThread } from '../lt/forum';
import { resolveOperatorEntry } from '../lt/guard';
import { materialExists } from '../lt/materials';
import { ltStore } from '../lt/store';
import { LtEntry, LtStatus, outstandingItems } from '../lt/types';
import { formatError } from './utils';

export const LT_SCHEDULE_SELECT = 'lt:pick';
export const LT_SCHEDULE_MODAL = 'lt:manual';

/** 候補に無い日を手入力するための選択肢。日付（YYYY-MM-DD）と取り違えない値にする。 */
export const LT_MANUAL_DATE_VALUE = 'manual';

/** セレクトの選択肢は 25 個まで。末尾の「その他の日付」の分を空けておく。 */
const MAX_DATE_OPTIONS = 24;

/**
 * 運営に提示する確定候補日。
 * 登壇者の希望日を先頭に置き、そのあとに通常の候補日を続ける。
 * 相談で候補外の日に決まった場合に備え、確定済みの日も必ず含める。
 */
export function scheduleDateChoices(
  entry: Pick<LtEntry, 'preferredDates' | 'eventDate'>,
  now: Date = new Date(),
): string[] {
  const preferred = [...entry.preferredDates].sort();
  const candidates = upcomingMeetupDates(config.ltDateCandidates, now);
  const merged = [...preferred, ...candidates.filter(date => !preferred.includes(date))];
  if (entry.eventDate && !merged.includes(entry.eventDate)) merged.unshift(entry.eventDate);
  return merged.slice(0, MAX_DATE_OPTIONS);
}

/** その日に既に確定している他の応募（自分自身は除く）。 */
/** 同じ開催日の枠を争う他の応募。枠は応募先（本番／テスト）ごとの別勘定。 */
function competitorsOn(eventDate: string, entry: LtEntry): LtEntry[] {
  return ltStore.entriesOnDate(eventDate, entry.isProd).filter(other => other.id !== entry.id);
}

function describeDate(date: string, entry: LtEntry): string {
  const others = competitorsOn(date, entry);
  if (others.length >= config.ltSlotsPerDay) {
    return `⛔ ${others.map(other => other.speakerName).join('、')} で埋まっています`.slice(0, 100);
  }
  if (date === entry.eventDate) return '✅ 現在の確定日';
  if (entry.preferredDates.includes(date)) return '⭐ 登壇者の希望日';
  return '空き';
}

function buildScheduleRow(entry: LtEntry): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = scheduleDateChoices(entry).map(date =>
    new StringSelectMenuOptionBuilder()
      .setLabel(formatMeetupDate(date) + (entry.preferredDates.includes(date) ? ' ⭐' : ''))
      .setValue(date)
      .setDescription(describeDate(date, entry))
      .setDefault(date === entry.eventDate),
  );

  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('その他の日付を入力する')
      .setValue(LT_MANUAL_DATE_VALUE)
      .setDescription('候補に無い日で確定する場合'),
  );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildCustomId(LT_SCHEDULE_SELECT, entry.id))
      .setPlaceholder('確定する開催日を選んでください')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options),
  );
}

/** 運営が判断するのに必要な材料（希望日・相談内容）を選択画面に添える。 */
function buildPickerHeader(entry: LtEntry): string {
  const preferred = entry.preferredDates.length
    ? entry.preferredDates.map(formatMeetupDate).join('、')
    : '未選択';

  const lines = [
    `**${entry.speakerName}**（<@${entry.speakerId}>）の日程を確定します。`,
    `・登壇者の希望日: ${preferred}`,
  ];
  if (entry.scheduleNote) lines.push(`・📮 相談: ${entry.scheduleNote.replace(/\n/g, ' ')}`);
  if (entry.eventDate) lines.push(`・現在の確定日: ${formatMeetupDate(entry.eventDate)}`);
  return lines.join('\n');
}

/** ポスト内の「運営: 日程を確定 / 変更」ボタン。候補日の選択画面を本人にだけ出す。 */
export async function handleLtScheduleButton(interaction: ButtonInteraction, args: string[]) {
  const entry = await resolveOperatorEntry(interaction, args[0]);
  if (!entry) return;

  await interaction.reply({
    content: buildPickerHeader(entry),
    components: [buildScheduleRow(entry)],
    ephemeral: true,
  });
}

function buildManualDateModal(entry: LtEntry): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildCustomId(LT_SCHEDULE_MODAL, entry.id))
    .setTitle('開催日の手入力')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('開催日')
        .setDescription('YYYY-MM-DD 形式（例: 2026-09-04）')
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('eventDate')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('2026-09-04')
          .setValue(entry.eventDate ?? '')
          .setMaxLength(10)
          .setRequired(true)),
    );
}

/**
 * 手入力を 'YYYY-MM-DD' に正規化する。
 * 運営が急いで打つ場面なので、全角数字・スラッシュ区切り・ゼロ無しも受け付ける。
 */
export function normalizeDateInput(raw: string): string | null {
  const half = raw.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const match = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/.exec(half);
  if (!match) return null;

  const key = `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  return parseDateKey(key) ? key : null;
}

/**
 * 確定してよいが運営に気づいてほしいこと。
 * 手入力を許している以上、打ち間違いは弾けないので警告として見せる。
 */
export function scheduleWarnings(eventDate: string, now: Date = new Date()): string[] {
  const date = parseDateKey(eventDate);
  if (!date) return [];

  const warnings: string[] = [];
  if (date.getDay() !== config.meetupWeekday) {
    warnings.push(`⚠️ ${formatMeetupDate(eventDate)} は通常の開催曜日ではありません。`);
  }
  if (eventDate < formatDateKey(now)) {
    warnings.push('⚠️ 過去の日付です。入力ミスでないか確認してください。');
  }
  return warnings;
}

/** 日程を確定したあとに移すステータス。素材集めや告知まで進んでいる場合は巻き戻さない。 */
function scheduledStatus(current: LtStatus): LtStatus {
  return current === 'applied' || current === 'cancelled' ? 'scheduled' : current;
}

/**
 * 日程を確定し、ポストの表示と登壇者への連絡までを行う。
 * 返り値は運営に見せる ephemeral の本文。
 */
async function applySchedule(
  interaction: RepliableInteraction,
  entry: LtEntry,
  eventDate: string,
): Promise<string> {
  // ボタンを押した時点の空き状況で判断する。
  // コンポーネントは作られた時点の状態を持っているため、別の応募が先に確定している可能性がある。
  const others = competitorsOn(eventDate, entry);
  if (others.length >= config.ltSlotsPerDay) {
    const names = others.map(other => `**${other.speakerName}**（<#${other.id}>）`).join('、');
    return `⛔ ${formatMeetupDate(eventDate)} は既に ${names} で埋まっています。\n`
      + '先にそちらのポストで「運営: 確定を取り消す」を実行してください。';
  }

  const previous = entry.eventDate;
  // 素材が先にそろっている場合、この確定で初めて告知画像を作れるようになる。
  // 既に画像があるときは、新しい日付で作り直す。
  const hadAnnounceImage = materialExists(entry.materials.announceImagePath);
  const updated = await syncAnnounceImage(ltStore.update(entry.id, {
    eventDate,
    status: scheduledStatus(entry.status),
  }));

  const thread = await fetchLtThread(interaction.client, entry.id);
  await applyLtEntryToPost(thread, updated, ltStore.slotUsageByDate(updated.isProd));
  await notifySpeaker(thread, updated, interaction.user.id, previous);
  if (!hadAnnounceImage) await postAnnounceImage(thread, updated);

  const headline = previous
    ? `✅ ${formatMeetupDate(previous)} → **${formatMeetupDate(eventDate)}** に変更しました。`
    : `✅ **${formatMeetupDate(eventDate)}** で確定しました。`;
  return [headline, ...scheduleWarnings(eventDate)].join('\n');
}

/** 確定内容を応募ポストに投稿する。登壇者が次にすることも併せて案内する。 */
async function notifySpeaker(
  thread: ThreadChannel,
  entry: LtEntry,
  operatorId: string,
  previous: string | null,
): Promise<void> {
  const headline = previous
    ? `📅 <@${entry.speakerId}> LT の日程を **${formatMeetupDate(previous)}** から `
      + `**${formatMeetupDate(entry.eventDate!)}** に変更しました。`
    : `🎉 <@${entry.speakerId}> LT の日程が **${formatMeetupDate(entry.eventDate!)}** に確定しました！`;

  const lines = [headline, `（確定: <@${operatorId}>）`];

  const outstanding = outstandingItems(entry);
  if (outstanding.length > 0) {
    lines.push(
      '',
      '**告知に向けて、次のご登録をお願いします。**',
      ...outstanding.map(item => `・${item}`),
      'タイトルと X アカウントは「✏️ タイトル・Xアカウントを登録」から入力できます。',
    );
  }
  // 素材は日程確定より先に届いていることがあるので、まだ無いものだけをお願いする
  const materials: string[] = [];
  if (!materialExists(entry.materials.speakerIconPath)) {
    materials.push(entry.xAccount
      ? '・アイコン: X のプロフィール画像を使わせていただきます'
      : '・アイコン画像（X アカウントを登録いただければプロフィール画像を使います）');
  }
  if (!materialExists(entry.materials.titleSlidePath)) {
    materials.push('・タイトルスライド（発表の1枚目）の画像 — `/lt-material` で登録できます');
  }
  if (!previous && materials.length > 0) {
    lines.push('', '**告知画像に使う素材**', ...materials);
  }

  await sendToThread(thread, lines.join('\n'), entry.speakerId);
}

async function sendToThread(thread: ThreadChannel, content: string, userId: string): Promise<void> {
  try {
    await thread.send({
      content,
      // 意図しない一斉メンションを防ぐため、対象を登壇者だけに絞る
      allowedMentions: { users: [userId] },
    });
  } catch (error) {
    console.error(`ポストへの通知に失敗しました (${thread.id}):`, error);
  }
}

/** 候補日セレクト（ephemeral）。「その他の日付」だけはモーダルへ分岐する。 */
export async function handleLtScheduleSelect(interaction: StringSelectMenuInteraction, args: string[]) {
  const entry = await resolveOperatorEntry(interaction, args[0]);
  if (!entry) return;

  const value = interaction.values[0];
  if (!value) return;

  if (value === LT_MANUAL_DATE_VALUE) {
    // showModal は最初の応答である必要があるので、ここでは defer しない。
    await interaction.showModal(buildManualDateModal(entry));
    return;
  }

  await interaction.deferUpdate();
  try {
    const message = await applySchedule(interaction, entry, value);
    await interaction.editReply({ content: message, components: [] });
  } catch (error) {
    console.error('handleLtScheduleSelect failed:', error);
    await interaction.editReply({ content: formatError(error), components: [] });
  }
}

/** 候補に無い日の手入力。相談（scheduleNote）で候補外に決まった場合の受け皿。 */
export async function handleLtScheduleModal(interaction: ModalSubmitInteraction, args: string[]) {
  const entry = await resolveOperatorEntry(interaction, args[0]);
  if (!entry) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const raw = interaction.fields.getTextInputValue('eventDate');
    const eventDate = normalizeDateInput(raw);
    if (!eventDate) {
      await interaction.editReply(`❌ 日付は YYYY-MM-DD 形式で入力してください。入力値: 「${raw}」`);
      return;
    }
    await interaction.editReply(await applySchedule(interaction, entry, eventDate));
  } catch (error) {
    console.error('handleLtScheduleModal failed:', error);
    await interaction.editReply(formatError(error));
  }
}

/**
 * 確定の取り消し。
 * 確定すると登壇者は希望日を触れなくなるので、運営側に必ず戻せる導線が要る。
 * 枠も解放されるため、応募が流れたときの枠の空け直しもここで行う。
 */
export async function handleLtUnscheduleButton(interaction: ButtonInteraction, args: string[]) {
  const entry = await resolveOperatorEntry(interaction, args[0]);
  if (!entry) return;

  if (!entry.eventDate) {
    await interaction.reply({ content: 'ℹ️ この応募はまだ日程が確定していません。', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const previous = entry.eventDate;
    const updated = ltStore.update(entry.id, { eventDate: null, status: 'applied' });

    const thread = await fetchLtThread(interaction.client, entry.id);
    // 確定 → 取り消し → 再確定と続けるとスレッド名の変更が
    // 10 分あたり 2 回の上限に触れるが、失敗してもレコードと本文は正しいまま。
    await applyLtEntryToPost(thread, updated, ltStore.slotUsageByDate(updated.isProd));
    await sendToThread(
      thread,
      `↩️ <@${updated.speakerId}> ${formatMeetupDate(previous)} の確定を取り消しました。`
      + `（操作: <@${interaction.user.id}>）\n改めて登壇できる日を選び直してください。`,
      updated.speakerId,
    );

    await interaction.editReply(`↩️ ${formatMeetupDate(previous)} の確定を取り消し、枠を解放しました。`);
  } catch (error) {
    console.error('handleLtUnscheduleButton failed:', error);
    await interaction.editReply(formatError(error));
  }
}
