import { describe, it, expect } from 'vitest';
import { cosine, hasCode, makeCode, recommend, tonightKey } from '../match';

const optins = {
  me: { vrcUserId: 'usr_me', displayName: 'わたし', joinedAt: '' },
  web: { vrcUserId: 'usr_web', displayName: 'Web の人', joinedAt: '' },
  hard: { vrcUserId: 'usr_hard', displayName: '電子工作の人', joinedAt: '' },
  half: { vrcUserId: 'usr_half', displayName: '半々の人', joinedAt: '' },
  none: { vrcUserId: 'usr_none', displayName: 'タグなし', joinedAt: '' },
};
const profiles = {
  usr_me: { mix: [1, 0], group: 'Web', tags: ['Web', 'サーバー'] },
  usr_web: { mix: [0.9, 0.1], group: 'Web', tags: ['Web', 'データベース'] },
  usr_hard: { mix: [0, 1], group: '電子工作', tags: ['電子工作'] },
  usr_half: { mix: [0.5, 0.5], group: '電子工作', tags: ['サーバー', '電子工作'] },
};

describe('recommend', () => {
  it('今夜押した人の中から、似ている順に選ぶ', () => {
    const recs = recommend('me', ['me', 'hard', 'web', 'half'], optins, profiles, 2);
    expect(recs.map(r => r.discordUserId)).toEqual(['web', 'half']);
    expect(recs[0]).toMatchObject({ displayName: 'Web の人', group: 'Web', sharedTags: ['Web'] });
  });

  it('今夜押していない人・やめた人・プロフィールのない人は選ばない', () => {
    const recs = recommend('me', ['me', 'none', 'gone', 'hard'], optins, profiles);
    expect(recs.map(r => r.discordUserId)).toEqual(['hard']);
  });

  it('自分のプロフィールがなければ選ばない', () => {
    expect(recommend('none', ['none', 'web'], optins, profiles)).toEqual([]);
  });
});

describe('tonightKey', () => {
  it('朝 6 時までは前の日の回', () => {
    expect(tonightKey(new Date(2026, 10, 20, 23, 30))).toBe('2026-11-20');
    expect(tonightKey(new Date(2026, 10, 21, 1, 0))).toBe('2026-11-20');
    expect(tonightKey(new Date(2026, 10, 21, 7, 0))).toBe('2026-11-21');
  });
});

describe('確認コード', () => {
  it('読み違えやすい文字を使わない', () => {
    for (let i = 0; i < 50; i++) expect(makeCode()).toMatch(/^EM-[A-HJKMNP-Z2-9]{6}$/);
  });

  it('ステータスか自己紹介のどちらかに入っていればよい', () => {
    expect(hasCode(['', 'よろしく em-abc234 です'], 'EM-ABC234')).toBe(true);
    expect(hasCode(['EM-ABC23', ''], 'EM-ABC234')).toBe(false);
  });
});

describe('cosine', () => {
  it('長さが違えば 0', () => {
    expect(cosine([1, 0], [1, 0, 0])).toBe(0);
    expect(cosine([1, 1], [2, 2])).toBeCloseTo(1);
  });
});
