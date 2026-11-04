import { describe, it, expect } from 'vitest';
import { meetupFeature } from '../feature';

// 機能のコマンドやボタンの一覧から、登録が漏れていないか
describe('meetupFeature', () => {
  it('開催確認・告知のスラッシュコマンドをそろえて持つ', () => {
    expect(meetupFeature.commands?.map(command => command.definition.name).sort())
      .toEqual(['confirm-meetup', 'post-announcement', 'pre-announce']);
  });

  // 投稿済みの開催確認のボタンを壊さないよう、旧形式の customId のまま
  it('開催確認のボタンを旧形式の customId で持つ', () => {
    expect(Object.keys(meetupFeature.buttons ?? {}).sort())
      .toEqual(['confirm_meetup_no', 'confirm_meetup_yes', 'meetup:late-pre-announce'].sort());
  });
});
