import {
  LabelBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../config';
import { buildCustomId } from '../interactions';
import { formatMeetupDate, upcomingMeetupDates } from '../lt/dates';
import {
  allCandidatesFull,
  buildLtComponents,
  buildLtEmbed,
  LT_DATES_CONSULT_VALUE,
  syncLtThreadName,
} from '../lt/forum';
import { resolveSpeakerEntry } from '../lt/guard';
import { ltStore } from '../lt/store';
import { LtEntry } from '../lt/types';
import { formatError } from './utils';

export const LT_CONSULT_MODAL = 'lt:consult';

/**
 * フォーラムポスト内の発表希望日セレクト。
 * 選択できるのは応募者本人だけ。運営が日程を確定するのは別フロー（承認）で、
 * ここで書き込むのは希望日（preferredDates）と相談内容（scheduleNote）のみ。
 */
export async function handleLtDatesSelect(interaction: StringSelectMenuInteraction, args: string[]) {
  const entry = await resolveSpeakerEntry(interaction, args[0], { requireUnscheduled: true });
  if (!entry) return;

  const wantsConsult = interaction.values.includes(LT_DATES_CONSULT_VALUE);
  const dates = interaction.values.filter(value => value !== LT_DATES_CONSULT_VALUE).sort();

  try {
    if (wantsConsult) {
      // showModal は最初の応答である必要があるため、日付の保存を先に済ませてから開く。
      // （相談モーダルを閉じられても、選ばれた日付は失われない）
      ltStore.update(entry.id, { preferredDates: dates });
      await interaction.showModal(buildConsultModal(entry));
      return;
    }

    const updated = ltStore.update(entry.id, { preferredDates: dates, scheduleNote: '' });

    await interaction.update({
      embeds: [buildLtEmbed(updated)],
      components: buildLtComponents(updated, ltStore.slotUsageByDate(updated.isProd)),
    });
    await renameThread(interaction, updated);
    await interaction.followUp({
      content: `📅 希望日を受け付けました: ${dates.map(formatMeetupDate).join('、')}\n運営が確定次第お知らせします。`,
    });
  } catch (error) {
    console.error('handleLtDatesSelect failed:', error);
    await replyError(interaction, error);
  }
}

function buildConsultModal(entry: LtEntry): ModalBuilder {
  const usage = ltStore.slotUsageByDate(entry.isProd);
  const description = allCandidatesFull(usage)
    ? '現在の候補日はすべて埋まっています。登壇できそうな時期をお知らせください'
    : `例: 「10月中旬以降なら可能」「${formatMeetupDate(upcomingMeetupDates(1)[0] ?? '')}以外の平日」`;

  return new ModalBuilder()
    .setCustomId(buildCustomId(LT_CONSULT_MODAL, entry.id))
    .setTitle('日程の相談')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('登壇できそうな時期・日付')
        .setDescription(description.slice(0, 100))
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('scheduleNote')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(true)),
    );
}

/**
 * 相談モーダルの送信。
 * 相談内容はフォーラムポスト内に投稿する。やり取りが応募ポストに集約され、
 * 運営・登壇者の双方が後から経緯を追えるようにするため。
 */
export async function handleLtConsultModal(interaction: ModalSubmitInteraction, args: string[]) {
  const entry = await resolveSpeakerEntry(interaction, args[0], { requireUnscheduled: true });
  if (!entry) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const scheduleNote = interaction.fields.getTextInputValue('scheduleNote').trim();
    const updated = ltStore.update(entry.id, { scheduleNote });

    // モーダルはセレクトから開かれているので、元のポストのメッセージを更新できる。
    await interaction.message?.edit({
      embeds: [buildLtEmbed(updated)],
      components: buildLtComponents(updated, ltStore.slotUsageByDate(updated.isProd)),
    });

    await renameThread(interaction, updated);
    await postConsultToThread(interaction, updated);
    await interaction.editReply(
      '📮 日程の相談をポストに投稿しました。運営から改めてご連絡します。',
    );
  } catch (error) {
    console.error('handleLtConsultModal failed:', error);
    await interaction.editReply(formatError(error));
  }
}

/** 希望日の変化をフォーラムのタイトル「日付 登壇者名」に反映する。 */
async function renameThread(
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction,
  entry: LtEntry,
): Promise<void> {
  const thread = interaction.channel;
  if (thread?.isThread()) await syncLtThreadName(thread, entry);
}

/** 相談内容を応募ポスト内に投稿する。運営ロールに気づいてもらうためメンションを付ける。 */
async function postConsultToThread(
  interaction: ModalSubmitInteraction,
  entry: LtEntry,
): Promise<void> {
  const thread = interaction.channel;
  if (!thread?.isThread()) {
    console.warn(`相談の投稿先がスレッドではありません: ${interaction.channelId}`);
    return;
  }

  const selected = entry.preferredDates.length
    ? entry.preferredDates.map(formatMeetupDate).join('、')
    : 'なし';
  const mention = config.operatorRoleId ? `<@&${config.operatorRoleId}> ` : '';

  await thread.send({
    content: [
      `${mention}📮 **日程の相談です**（<@${entry.speakerId}>）`,
      '',
      `> ${entry.scheduleNote.replace(/\n/g, '\n> ')}`,
      '',
      `選択済みの候補日: ${selected}`,
    ].join('\n'),
    // 意図しない一斉メンションを防ぐため、対象を運営ロールだけに絞る
    allowedMentions: { roles: config.operatorRoleId ? [config.operatorRoleId] : [] },
  });
}

async function replyError(interaction: StringSelectMenuInteraction, error: unknown): Promise<void> {
  const content = formatError(error);
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}
