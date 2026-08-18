import {
  ButtonInteraction,
  LabelBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { buildCustomId } from '../interactions';
import { postAnnounceImage, syncAnnounceImage } from '../lt/announce-image';
import { applyLtEntryToPost, fetchLtThread } from '../lt/forum';
import { resolveSpeakerEntry } from '../lt/guard';
import { materialExists } from '../lt/materials';
import { ltStore } from '../lt/store';
import { LtEntry, needsTitle, normalizeXAccount, outstandingItems } from '../lt/types';
import { formatError } from './utils';

export const LT_EDIT_MODAL = 'lt:info';

/**
 * 応募後に登壇者が埋める情報の編集。
 *
 * 応募時点ではタイトルが「未定」でよい運用なので、決まってから登録できる導線が要る。
 * X アカウントは告知画像のアイコン（＝X のプロフィール画像）に使うため、
 * 応募モーダルの 5 枠に収まらない分としてここで受け取る。
 */
export async function handleLtEditButton(interaction: ButtonInteraction, args: string[]) {
  // 口頭で聞いた内容を運営が代理入力できるようにしておく
  const entry = await resolveSpeakerEntry(interaction, args[0], { allowOperator: true });
  if (!entry) return;

  await interaction.showModal(buildEditModal(entry));
}

function buildEditModal(entry: LtEntry): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildCustomId(LT_EDIT_MODAL, entry.id))
    .setTitle('登壇情報の登録')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('発表テーマ・タイトル')
        .setDescription('決まっていなければ「未定」のままで構いません')
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('title')
          .setStyle(TextInputStyle.Short)
          .setValue(entry.title)
          .setMaxLength(100)
          .setRequired(true)),
      new LabelBuilder()
        .setLabel('Xアカウント')
        .setDescription('告知画像のアイコンにプロフィール画像を使わせていただきます')
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('xAccount')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('@example')
          .setValue(entry.xAccount ? `@${entry.xAccount}` : '')
          .setMaxLength(50)
          .setRequired(false)),
    );
}

export async function handleLtEditModal(interaction: ModalSubmitInteraction, args: string[]) {
  const entry = await resolveSpeakerEntry(interaction, args[0], { allowOperator: true });
  if (!entry) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const title = interaction.fields.getTextInputValue('title').trim();
    const rawX = interaction.fields.getTextInputValue('xAccount').trim();

    // 空欄は「登録しない」。書かれているのに読み取れない場合だけ弾く。
    const xAccount = rawX === '' ? null : normalizeXAccount(rawX);
    if (rawX !== '' && !xAccount) {
      await interaction.editReply(
        `❌ X アカウントを読み取れませんでした。\`@example\` または \`https://x.com/example\` の形式で入力してください。入力値: 「${rawX}」`,
      );
      return;
    }

    // タイトルは告知画像に載る。ここで初めて素材がそろうこともあるので、未生成なら生成する。
    const hadAnnounceImage = materialExists(entry.materials.announceImagePath);
    const updated = await syncAnnounceImage(ltStore.update(entry.id, { title, xAccount }));

    const thread = await fetchLtThread(interaction.client, entry.id);
    await applyLtEntryToPost(thread, updated, ltStore.slotUsageByDate());
    if (!hadAnnounceImage) await postAnnounceImage(thread, updated);

    await interaction.editReply(buildEditFeedback(updated));
  } catch (error) {
    console.error('handleLtEditModal failed:', error);
    await interaction.editReply(formatError(error));
  }
}

/** 何が登録できて何が残っているかを、そのまま次の行動につながる形で返す。 */
function buildEditFeedback(entry: LtEntry): string {
  const lines = ['✅ 登壇情報を更新しました。'];
  lines.push(needsTitle(entry.title) ? '・タイトル: 未定のまま' : `・タイトル: ${entry.title}`);
  lines.push(entry.xAccount ? `・Xアカウント: @${entry.xAccount}` : '・Xアカウント: 未登録');

  const outstanding = outstandingItems(entry);
  if (outstanding.length > 0) {
    lines.push('', '**まだ埋まっていない項目があります。**', ...outstanding.map(item => `・${item}`));
  }
  return lines.join('\n');
}
