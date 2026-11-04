import { describe, it, expect } from 'vitest';
import { calendarFeature } from '../feature';

// 機能のコマンドやボタンの一覧から、登録が漏れていないか
describe('calendarFeature', () => {
  it('イベント登録のスラッシュコマンドをそろえて持つ', () => {
    expect(calendarFeature.commands?.map(command => command.definition.name).sort())
      .toEqual(['discord-event', 'event-calendar', 'vrc-event']);
  });
});
