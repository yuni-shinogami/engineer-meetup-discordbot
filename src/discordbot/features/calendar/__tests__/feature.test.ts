import { describe, it, expect } from 'vitest';
import { calendarFeature } from '../feature';

// 入口から登録が漏れていないか。index.ts の switch と commands/index.ts で登録していたものと同じ一覧
describe('calendarFeature', () => {
  it('イベント登録のスラッシュコマンドをそろえて持つ', () => {
    expect(calendarFeature.commands?.map(command => command.definition.name).sort())
      .toEqual(['discord-event', 'event-calendar', 'vrc-event']);
  });
});
