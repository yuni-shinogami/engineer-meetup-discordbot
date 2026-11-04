import { describe, it, expect } from 'vitest';
import type { ForumChannel } from 'discord.js';
import { LT_STATUS_LABELS, LtTagResolutionError, requireLtTagIds, resolveLtTags } from '../status';
import { LT_STATUSES } from '../types';

const forumWithTags = (names: string[]) => ({
  availableTags: names.map((name, i) => ({ id: `tag-${i}`, name })),
}) as ForumChannel;

const allLabels = LT_STATUSES.map(s => LT_STATUS_LABELS[s]);

describe('LT_STATUS_LABELS', () => {
  it('全ステータスに日本語ラベルがある', () => {
    for (const status of LT_STATUSES) {
      expect(LT_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('ラベルは重複しない（タグ名の引き当てが一意になる）', () => {
    expect(new Set(allLabels).size).toBe(LT_STATUSES.length);
  });

  it('ラベルに絵文字を含めない（絵文字はタグの別フィールドのため）', () => {
    for (const label of allLabels) {
      expect(label).toMatch(/^[ぁ-んァ-ヶ一-龠ー]+$/);
    }
  });
});

describe('resolveLtTags', () => {
  it('タグ名からステータスごとのタグ ID を引き当てる', () => {
    const { tagIds, missing } = resolveLtTags(forumWithTags(allLabels));
    expect(missing).toEqual([]);
    expect(tagIds.applied).toBe('tag-0');
    expect(tagIds.cancelled).toBe(`tag-${allLabels.length - 1}`);
  });

  it('LT が管理しないタグが混ざっていても無視する', () => {
    const { missing } = resolveLtTags(forumWithTags(['重要', ...allLabels, '雑談']));
    expect(missing).toEqual([]);
  });

  it('不足しているタグを missing に積み、throw しない', () => {
    const { tagIds, missing } = resolveLtTags(forumWithTags(['受付中', '日程確定']));
    expect(missing).toEqual(['ready', 'announced', 'done', 'cancelled']);
    expect(tagIds.applied).toBe('tag-0');
  });
});

describe('requireLtTagIds', () => {
  it('全て揃っていれば ID を返す', () => {
    expect(requireLtTagIds(forumWithTags(allLabels)).scheduled).toBe('tag-1');
  });

  it('不足があれば不足分を名指ししてエラーにする', () => {
    try {
      requireLtTagIds(forumWithTags(['受付中']));
      expect.unreachable('エラーになるはず');
    } catch (error) {
      expect(error).toBeInstanceOf(LtTagResolutionError);
      expect((error as LtTagResolutionError).missing).toContain('done');
      expect((error as Error).message).toContain('「登壇完了」');
    }
  });
});
