import {
  ChatInputCommandInteraction,
  GuildMember,
  LabelBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
} from 'discord.js';
import { buildCustomId } from '../interactions';
import { createLtPost, fetchLtForum, operationsChannelIdFor } from '../lt/forum';
import { requireLtTagIds } from '../lt/status';
import { ltStore } from '../lt/store';
import {
  ARCHIVE_POLICY_CHOICES,
  CAPTURE_POLICY_CHOICES,
  isArchivePolicy,
  isCapturePolicy,
  PolicyChoice,
} from '../lt/types';
import { formatError } from './utils';

export const LT_APPLY_MODAL = 'lt:apply';

const DURATION_MIN = 1;
const DURATION_MAX = 120;

export const ltApplyCommand = new SlashCommandBuilder()
  .setName('lt-apply')
  .setDescription('LT（ライトニングトーク）に応募します')
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番フォーラムに応募する場合はTrueにしてください（デフォルトはFalse: テストフォーラム）')
  );

/**
 * 応募モーダル。
 *
 * Discord のモーダルはコンポーネント 5 個までなので、応募フォームの設問のうち
 * 「Discord のユーザー名」は interaction から取得できるため省き、
 * 「撮影・拡散の可否」と「動画公開の可否」は 1 問に統合し、
 * 「発表希望日」は作成後のフォーラムポスト内のセレクトで受け取る。
 */
export async function handleLtApplyCommand(interaction: ChatInputCommandInteraction) {
  // 応募は登壇者本人が行うため、運営ロールは要求しない。
  const isProd = interaction.options.getBoolean('production') ?? false;

  const defaultName = interaction.member instanceof GuildMember
    ? interaction.member.displayName
    : interaction.user.displayName;

  const modal = new ModalBuilder()
    .setCustomId(buildCustomId(LT_APPLY_MODAL, isProd ? '1' : '0'))
    .setTitle('LT応募フォーム')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('発表者の名前')
        .setDescription('呼ばれたい名前・SNSでの名前・プラットフォームでの通名など')
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('speakerName')
          .setStyle(TextInputStyle.Short)
          .setValue(defaultName)
          .setMaxLength(50)
          .setRequired(true)),
      new LabelBuilder()
        .setLabel('発表テーマ・タイトル')
        .setDescription('未定の場合は「未定」と書いてください')
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('title')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)),
      new LabelBuilder()
        .setLabel('LTの所要時間（分）')
        .setDescription('予想で構いません')
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('durationMin')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('例: 10')
          .setMaxLength(3)
          .setRequired(true)),
      new LabelBuilder()
        .setLabel('参加者による撮影・SNS拡散')
        .setDescription('参加者がLTのスライドを写真撮影し、SNSで拡散してよいか')
        .setStringSelectMenuComponent(new StringSelectMenuBuilder()
          .setCustomId('capturePolicy')
          .setPlaceholder('選択してください')
          .addOptions(CAPTURE_POLICY_CHOICES.map(toOption))),
      new LabelBuilder()
        .setLabel('集会YouTubeチャンネルへの録画公開')
        .setDescription('LTの録画をエンジニア集会のYouTubeにアップしてよいか')
        .setStringSelectMenuComponent(new StringSelectMenuBuilder()
          .setCustomId('archivePolicy')
          .setPlaceholder('選択してください')
          .addOptions(ARCHIVE_POLICY_CHOICES.map(toOption))),
    );

  // showModal は最初の応答である必要があるため deferReply してはいけない。
  await interaction.showModal(modal);
}

function toOption<T extends string>({ value, label, description }: PolicyChoice<T>) {
  return { value, label, description };
}

export function parseDuration(raw: string): number | null {
  const normalized = raw.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const match = /^\d+/.exec(normalized);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isInteger(value) || value < DURATION_MIN || value > DURATION_MAX) return null;
  return value;
}

function firstSelected(interaction: ModalSubmitInteraction, customId: string): string | undefined {
  return interaction.fields.getStringSelectValues(customId)[0];
}

export async function handleLtApplyModal(interaction: ModalSubmitInteraction, args: string[]) {
  const isProd = args[0] === '1';
  await interaction.deferReply({ ephemeral: true });

  const durationRaw = interaction.fields.getTextInputValue('durationMin');
  const durationMin = parseDuration(durationRaw);
  if (durationMin === null) {
    await interaction.editReply(
      `❌ 所要時間は ${DURATION_MIN}〜${DURATION_MAX} の半角数字（分）で入力してください。入力値: 「${durationRaw}」`,
    );
    return;
  }

  const capturePolicy = firstSelected(interaction, 'capturePolicy');
  if (!capturePolicy || !isCapturePolicy(capturePolicy)) {
    await interaction.editReply('❌ 参加者による撮影・SNS拡散の可否を選択してください。');
    return;
  }

  const archivePolicy = firstSelected(interaction, 'archivePolicy');
  if (!archivePolicy || !isArchivePolicy(archivePolicy)) {
    await interaction.editReply('❌ 集会YouTubeチャンネルへの録画公開の可否を選択してください。');
    return;
  }

  const draft = {
    speakerId: interaction.user.id,
    speakerName: interaction.fields.getTextInputValue('speakerName').trim(),
    title: interaction.fields.getTextInputValue('title').trim(),
    durationMin,
    capturePolicy,
    archivePolicy,
  };

  let thread: ThreadChannel | undefined;
  try {
    const forum = await fetchLtForum(interaction.client, isProd);
    const tagIds = requireLtTagIds(forum);

    thread = await createLtPost(forum, draft, tagIds.applied, ltStore.slotUsageByDate());
    // スレッド ID を主キーにするため、レコード作成はスレッド作成後。
    // ここで失敗するとポストだけが残るので、片付けてからエラーを返す。
    ltStore.create({ id: thread.id, ...draft });

    await notifyOperations(interaction, thread, draft.speakerId, isProd);
    await interaction.editReply(
      `✅ LT応募を受け付けました！\n${thread.url}\n\n`
      + 'ポスト内のメニューから **登壇できる日** と **動画を流す予定があるか** を選んでください。',
    );
  } catch (error) {
    console.error('handleLtApplyModal failed:', error);
    if (thread && !ltStore.get(thread.id)) {
      const orphanId = thread.id;
      await thread.delete('LT レコードの作成に失敗したためロールバック').catch(() => {
        console.error(`ロールバックに失敗しました。手動で削除してください: ${orphanId}`);
      });
    }
    await interaction.editReply(formatError(error));
  }
}

async function notifyOperations(
  interaction: ModalSubmitInteraction,
  thread: ThreadChannel,
  speakerId: string,
  isProd: boolean,
): Promise<void> {
  const channelId = operationsChannelIdFor(isProd);
  if (!channelId) return;
  try {
    const channel = await interaction.client.channels.fetch(channelId) as TextChannel | null;
    await channel?.send(`📝 新しい LT 応募がありました（<@${speakerId}>）\n${thread.url}`);
  } catch (error) {
    // 通知の失敗で応募自体を失敗させない
    console.error('Failed to notify operations channel:', error);
  }
}
