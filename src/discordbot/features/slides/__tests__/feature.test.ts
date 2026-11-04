import { describe, it, expect } from 'vitest';
import { slidesFeature } from '../feature';

// 機能のコマンドやボタンの一覧から、登録が漏れていないか
describe('slidesFeature', () => {
  it('/slides を持つ', () => {
    expect(slidesFeature.commands?.map(command => command.definition.name)).toEqual(['slides']);
  });
});
