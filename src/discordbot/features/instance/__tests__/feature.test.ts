import { describe, it, expect } from 'vitest';
import { instanceFeature } from '../feature';

// 入口から登録が漏れていないか。index.ts の switch・handlers.ts・commands/index.ts で登録していたものと同じ一覧
describe('instanceFeature', () => {
  it('インスタンス作成とアカウント登録のスラッシュコマンドを持つ', () => {
    expect(instanceFeature.commands?.map(command => command.definition.name).sort())
      .toEqual(['create-instance', 'vrc-link']);
  });

  it('/create-instance の結果に付くボタンをそろえて持つ', () => {
    // サブアカウントで入る・自分に招待と、録画パネルの 7 つ
    expect(Object.keys(instanceFeature.buttons ?? {})).toHaveLength(9);
    for (const handler of Object.values(instanceFeature.buttons ?? {})) expect(handler).toBeTypeOf('function');
  });
});
