import { generateImage } from '../../image-gen/generate';
import { formatImageDate } from './dates';
import { materialExists, readMaterialAsDataUrl, writeMaterial } from './materials';
import { ltStore } from './store';
import { LtEntry, needsTitle } from './types';

/**
 * 告知画像を作るのに足りていないもの。
 * 「あと何をもらえば告知に進めるか」をそのまま登壇者・運営に見せる文言にしている。
 */
export function missingForAnnounceImage(entry: LtEntry): string[] {
  const missing: string[] = [];
  if (!entry.eventDate) missing.push('開催日の確定（運営）');
  if (needsTitle(entry.title)) missing.push('LT のタイトル');
  if (!materialExists(entry.materials.speakerIconPath)) missing.push('登壇者アイコン画像');
  if (!materialExists(entry.materials.titleSlidePath)) missing.push('タイトルスライド画像');
  return missing;
}

/** レコードの内容から告知画像を描画する。素材が欠けている場合は呼ぶ前に弾くこと。 */
export async function renderAnnounceImage(entry: LtEntry): Promise<Buffer> {
  const missing = missingForAnnounceImage(entry);
  if (missing.length > 0) {
    throw new Error(`告知画像を生成できません（不足: ${missing.join('、')}）`);
  }

  return generateImage({
    template: 'lt-announce',
    title: entry.title,
    speakerName: entry.speakerName,
    speakerIcon: readMaterialAsDataUrl(entry.materials.speakerIconPath!),
    eventDate: formatImageDate(entry.eventDate!),
    titleSlideImage: readMaterialAsDataUrl(entry.materials.titleSlidePath!),
  });
}

/**
 * 告知画像を生成してファイルに保存し、レコードを更新する。
 * 画像がそろった時点で `ready`（準備完了）に上げるが、告知済み以降は巻き戻さない。
 */
export async function buildAnnounceImage(entry: LtEntry): Promise<LtEntry> {
  const buffer = await renderAnnounceImage(entry);
  const filePath = writeMaterial(entry.id, 'announceImage', buffer, 'png');

  return ltStore.update(entry.id, {
    materials: { ...entry.materials, announceImagePath: filePath },
    status: entry.status === 'scheduled' ? 'ready' : entry.status,
  });
}

/**
 * 既に生成済みの告知画像を、レコードの現在値に合わせて作り直す。
 *
 * タイトルや開催日が変わると画像の内容が古くなるため、変更のたびに追従させる。
 * 表示の同期と同じ扱いで、失敗しても呼び出し元の操作は止めない。
 */
export async function regenerateAnnounceImage(entry: LtEntry): Promise<LtEntry> {
  if (!materialExists(entry.materials.announceImagePath)) return entry;
  if (missingForAnnounceImage(entry).length > 0) return entry;

  try {
    return await buildAnnounceImage(entry);
  } catch (error) {
    console.error(`告知画像の再生成に失敗しました (${entry.id}):`, error);
    return entry;
  }
}
