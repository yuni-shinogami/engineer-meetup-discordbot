import { describe, it, expect } from 'vitest';
import { ltFeature } from '../feature';

// 入口から LT の登録が漏れていないか。handlers.ts と index.ts で登録していたものと同じ一覧
describe('ltFeature', () => {
  it('LT のスラッシュコマンドをそろえて持つ', () => {
    expect(ltFeature.commands?.map(command => command.definition.name).sort())
      .toEqual(['generate-lt-image', 'lt-apply', 'lt-material']);
  });

  it('フォーラムのポスト内のボタン・モーダル・セレクトをそろえて持つ', () => {
    expect(Object.keys(ltFeature.buttons ?? {})).toHaveLength(5);
    expect(Object.keys(ltFeature.modals ?? {})).toHaveLength(4);
    expect(Object.keys(ltFeature.selects ?? {})).toHaveLength(3);
    for (const handler of [
      ...Object.values(ltFeature.buttons ?? {}),
      ...Object.values(ltFeature.modals ?? {}),
      ...Object.values(ltFeature.selects ?? {}),
    ]) {
      expect(handler).toBeTypeOf('function');
    }
  });

  it('キーに customId の書き間違い（空や undefined）が無い', () => {
    for (const key of [
      ...Object.keys(ltFeature.buttons ?? {}),
      ...Object.keys(ltFeature.modals ?? {}),
      ...Object.keys(ltFeature.selects ?? {}),
    ]) {
      expect(key).toMatch(/^lt:[a-z-]+$/);
    }
  });
});
