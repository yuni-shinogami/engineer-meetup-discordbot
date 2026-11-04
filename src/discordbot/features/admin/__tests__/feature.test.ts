import { describe, it, expect } from 'vitest';
import { adminFeature } from '../feature';

// 機能のコマンドやボタンの一覧から、登録が漏れていないか
describe('adminFeature', () => {
  it('/status と /check-permissions を持つ', () => {
    expect(adminFeature.commands?.map(command => command.definition.name).sort())
      .toEqual(['check-permissions', 'status']);
  });
});
