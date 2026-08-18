import {
  Attachment,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ThreadChannel,
} from 'discord.js';
import { fetchXProfileImageUrl } from '../../x/profileImage';
import { buildAnnounceImage, missingForAnnounceImage, postAnnounceImage } from '../lt/announce-image';
import { applyLtEntryToPost, fetchLtThread, isProdLtThread } from '../lt/forum';
import { resolveSpeakerEntry } from '../lt/guard';
import { MaterialError, materialExists, saveMaterialFromUrl } from '../lt/materials';
import { ltStore } from '../lt/store';
import { LtEntry } from '../lt/types';
import { formatError } from './utils';

/** 素材を受け付ける対象。告知が済んだあとの差し替えは想定しないが、取り下げ以外は許す。 */
const ACTIVE_STATUSES = ['applied', 'scheduled', 'ready', 'announced'] as const;

export const ltMaterialCommand = new SlashCommandBuilder()
  .setName('lt-material')
  .setDescription('LT告知に使う素材（タイトルスライド・アイコン）を登録します')
  .addAttachmentOption(option =>
    option.setName('title-slide')
      .setDescription('タイトルスライドの画像（発表の1枚目）')
  )
  .addAttachmentOption(option =>
    option.setName('icon')
      .setDescription('登壇者アイコン画像（省略時はXのプロフィール画像を使います）')
  );

/**
 * 操作対象の応募を決める。
 * 応募ポストの中で実行するのが基本だが、進行中の応募が1件しかなければどこからでも通す。
 */
function findEntryId(interaction: ChatInputCommandInteraction): string | { error: string } {
  const channelId = interaction.channelId;
  if (interaction.channel?.isThread() && ltStore.get(channelId)) return channelId;

  const mine = ltStore.findBySpeaker(interaction.user.id, ACTIVE_STATUSES);
  if (mine.length === 1) return mine[0]!.id;
  if (mine.length === 0) {
    return { error: '❌ 進行中の LT 応募が見つかりません。まず `/lt-apply` で応募してください。' };
  }
  return { error: '❌ 進行中の応募が複数あります。素材を登録したい応募のポストの中で実行してください。' };
}

export async function handleLtMaterialCommand(interaction: ChatInputCommandInteraction) {
  // resolveSpeakerEntry が拒否時に reply するため、defer より先に解決しておく
  const resolved = findEntryId(interaction);
  if (typeof resolved !== 'string') {
    await interaction.reply({ content: resolved.error, ephemeral: true });
    return;
  }

  const entry = await resolveSpeakerEntry(interaction, resolved, { allowOperator: true });
  if (!entry) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const thread = await fetchLtThread(interaction.client, entry.id);
    const notes: string[] = [];

    const materials = { ...entry.materials };
    const iconAttachment = interaction.options.getAttachment('icon');
    const slideAttachment = interaction.options.getAttachment('title-slide');

    const before = { ...materials };

    if (slideAttachment) {
      materials.titleSlidePath = await saveAttachment(entry.id, 'titleSlide', slideAttachment);
      notes.push('✅ タイトルスライドを保存しました。');
    }

    if (iconAttachment) {
      materials.speakerIconPath = await saveAttachment(entry.id, 'speakerIcon', iconAttachment);
      notes.push('✅ 登壇者アイコンを保存しました。');
    } else if (!materials.speakerIconPath) {
      notes.push(await tryXProfileImage(entry, thread, materials));
    }

    // 素材が変わっていないのに作り直すと、同じ画像をポストに投げ直すことになる。
    // 素材が入れ替わったときと、まだ画像が無いときだけ生成する。
    const changed = materials.speakerIconPath !== before.speakerIconPath
      || materials.titleSlidePath !== before.titleSlidePath;

    let updated = ltStore.update(entry.id, { materials });
    if (changed || !materialExists(materials.announceImagePath)) {
      updated = await tryBuildAnnounceImage(updated, thread, notes);
    }

    await applyLtEntryToPost(thread, updated, ltStore.slotUsageByDate());
    await interaction.editReply(notes.join('\n') || 'ℹ️ 変更はありませんでした。');
  } catch (error) {
    console.error('handleLtMaterialCommand failed:', error);
    // 形式・サイズの不備は利用者が直せるので、そのまま伝える
    await interaction.editReply(
      error instanceof MaterialError ? `❌ ${error.message}` : formatError(error),
    );
  }
}

async function saveAttachment(
  entryId: string,
  kind: 'speakerIcon' | 'titleSlide',
  attachment: Attachment,
): Promise<string> {
  return saveMaterialFromUrl(entryId, kind, attachment.url);
}

/**
 * アイコンが未登録なら X のプロフィール画像で埋める。
 * X API のプランによっては引けないため、失敗しても素材登録全体は止めず、案内だけ返す。
 */
async function tryXProfileImage(
  entry: LtEntry,
  thread: ThreadChannel,
  materials: LtEntry['materials'],
): Promise<string> {
  if (!entry.xAccount) {
    return 'ℹ️ 登壇者アイコンが未登録です。X アカウントを登録するか、`icon` に画像を添付してください。';
  }

  const url = await fetchXProfileImageUrl(entry.xAccount, isProdLtThread(thread));
  if (!url) {
    return `⚠️ @${entry.xAccount} のプロフィール画像を取得できませんでした。`
      + '`icon` に画像を添付してください。';
  }

  try {
    materials.speakerIconPath = await saveMaterialFromUrl(entry.id, 'speakerIcon', url);
    return `✅ @${entry.xAccount} のプロフィール画像をアイコンに設定しました。`;
  } catch (error) {
    console.error('X プロフィール画像の保存に失敗:', error);
    return '⚠️ X のプロフィール画像を保存できませんでした。`icon` に画像を添付してください。';
  }
}

/** そろっていれば告知画像を生成してポストに投稿する。足りなければ何が要るかを返す。 */
async function tryBuildAnnounceImage(
  entry: LtEntry,
  thread: ThreadChannel,
  notes: string[],
): Promise<LtEntry> {
  const missing = missingForAnnounceImage(entry);
  if (missing.length > 0) {
    notes.push('', '**告知画像を作るには、あと次のものが必要です。**', ...missing.map(item => `・${item}`));
    return entry;
  }

  const updated = await buildAnnounceImage(entry);
  notes.push('', '🖼️ 告知画像を生成し、ポストに投稿しました。内容をご確認ください。');
  await postAnnounceImage(thread, updated);

  return updated;
}
