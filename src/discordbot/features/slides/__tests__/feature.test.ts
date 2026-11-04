import { describe, it, expect } from 'vitest';
import { slidesFeature } from '../feature';

// 入口から登録が漏れていないか。index.ts の switch と commands/index.ts で登録していたものと同じ一覧
describe('slidesFeature', () => {
  it('/slides を持つ', () => {
    expect(slidesFeature.commands?.map(command => command.definition.name)).toEqual(['slides']);
  });
});
