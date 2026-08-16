import { describe, it, expect, vi, beforeEach } from 'vitest';

const { userByUsername } = vi.hoisted(() => ({ userByUsername: vi.fn() }));

vi.mock('../xBot', () => ({
  createXClient: () => ({ v2: { userByUsername } }),
}));

import { fetchXProfileImageUrl, upgradeProfileImageUrl } from '../profileImage';

describe('upgradeProfileImageUrl', () => {
  it('48px の _normal を 400px 版に差し替える', () => {
    expect(upgradeProfileImageUrl('https://pbs.twimg.com/profile_images/1/abc_normal.jpg'))
      .toBe('https://pbs.twimg.com/profile_images/1/abc_400x400.jpg');
  });

  it('クエリが付いていても壊さない', () => {
    expect(upgradeProfileImageUrl('https://pbs.twimg.com/profile_images/1/abc_normal.png?v=2'))
      .toBe('https://pbs.twimg.com/profile_images/1/abc_400x400.png?v=2');
  });

  it('_normal でない URL はそのまま返す', () => {
    const url = 'https://pbs.twimg.com/profile_images/1/abc.jpg';
    expect(upgradeProfileImageUrl(url)).toBe(url);
  });
});

describe('fetchXProfileImageUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('プロフィール画像 URL を 400px 版で返す', async () => {
    userByUsername.mockResolvedValue({ data: { profile_image_url: 'https://x/abc_normal.jpg' } });

    expect(await fetchXProfileImageUrl('example', false)).toBe('https://x/abc_400x400.jpg');
  });

  // X API のプランによってはユーザー検索を使えないため、呼び出し元を落としてはいけない
  it('API が失敗しても例外にせず null を返す', async () => {
    userByUsername.mockRejectedValue(new Error('403 Forbidden'));

    expect(await fetchXProfileImageUrl('example', false)).toBeNull();
  });

  it('画像 URL が含まれていなければ null', async () => {
    userByUsername.mockResolvedValue({ data: {} });

    expect(await fetchXProfileImageUrl('example', false)).toBeNull();
  });
});
