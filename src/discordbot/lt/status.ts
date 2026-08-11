import { ForumChannel } from 'discord.js';
import { LT_STATUSES, LtStatus } from './types';

/**
 * 内部キー（英語）と Discord フォーラムタグ名（日本語）の対応。
 * タグ名を変えたいときはここだけを書き換える。
 * 絵文字はタグの `name` とは別フィールドなので、ここに含めてはいけない。
 */
export const LT_STATUS_LABELS: Record<LtStatus, string> = {
  applied: '受付中',
  scheduled: '日程確定',
  ready: '準備完了',
  announced: '告知済み',
  done: '登壇完了',
  cancelled: '取り下げ',
};

export interface LtTagResolution {
  tagIds: Partial<Record<LtStatus, string>>;
  /** フォーラムに対応するタグが見つからなかったステータス */
  missing: LtStatus[];
}

/** フォーラムのタグをタグ名で引き当てる。不足があっても throw せず missing に積む（/status 用）。 */
export function resolveLtTags(forum: ForumChannel): LtTagResolution {
  const idByName = new Map(forum.availableTags.map(tag => [tag.name, tag.id]));
  const tagIds: Partial<Record<LtStatus, string>> = {};
  const missing: LtStatus[] = [];

  for (const status of LT_STATUSES) {
    const id = idByName.get(LT_STATUS_LABELS[status]);
    if (id) {
      tagIds[status] = id;
    } else {
      missing.push(status);
    }
  }

  return { tagIds, missing };
}

export class LtTagResolutionError extends Error {
  constructor(public readonly missing: LtStatus[]) {
    const detail = missing.map(s => `「${LT_STATUS_LABELS[s]}」(${s})`).join('、');
    super(`LT フォーラムに次のタグが見つかりません: ${detail}\nDiscord のフォーラム設定でタグを作成してください。`);
    this.name = 'LtTagResolutionError';
  }
}

/** 全ステータス分のタグが揃っていることを保証して返す。 */
export function requireLtTagIds(forum: ForumChannel): Record<LtStatus, string> {
  const { tagIds, missing } = resolveLtTags(forum);
  if (missing.length > 0) throw new LtTagResolutionError(missing);
  return tagIds as Record<LtStatus, string>;
}
