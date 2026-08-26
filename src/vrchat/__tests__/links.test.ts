import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseVrchatProfile, profileUrl, VrcLinkStore } from '../links';

const USER_ID = 'usr_d559169b-fee8-4d7c-b78f-2d0924666750';

describe('parseVrchatProfile', () => {
  it('プロフィールURLからユーザーIDを取り出す', () => {
    expect(parseVrchatProfile(`https://vrchat.com/home/user/${USER_ID}`))
      .toEqual({ ok: true, userId: USER_ID });
  });

  it('末尾スラッシュ・クエリ・フラグメントを剥がす', () => {
    for (const suffix of ['/', '?foo=bar', '#top', '/?a=1']) {
      expect(parseVrchatProfile(`https://vrchat.com/home/user/${USER_ID}${suffix}`))
        .toEqual({ ok: true, userId: USER_ID });
    }
  });

  it('www 付き・http・スキーム無しも受け付ける', () => {
    for (const url of [
      `https://www.vrchat.com/home/user/${USER_ID}`,
      `http://vrchat.com/home/user/${USER_ID}`,
      `vrchat.com/home/user/${USER_ID}`,
    ]) {
      expect(parseVrchatProfile(url)).toEqual({ ok: true, userId: USER_ID });
    }
  });

  it('前後の空白は無視する', () => {
    expect(parseVrchatProfile(`  https://vrchat.com/home/user/${USER_ID}  `))
      .toEqual({ ok: true, userId: USER_ID });
  });

  it('生のユーザーIDも受け付ける', () => {
    expect(parseVrchatProfile(USER_ID)).toEqual({ ok: true, userId: USER_ID });
  });

  // usr_ + UUID だけを通す正規表現にすると、VRChat 古参アカウントが登録できなくなる
  it('レガシーIDを弾かない', () => {
    expect(parseVrchatProfile('8JoV9XEdpo')).toEqual({ ok: true, userId: '8JoV9XEdpo' });
    expect(parseVrchatProfile('https://vrchat.com/home/user/8JoV9XEdpo'))
      .toEqual({ ok: true, userId: '8JoV9XEdpo' });
  });

  it('ワールド・グループ・アバターのURLは何を貼るべきか指摘する', () => {
    const world = parseVrchatProfile('https://vrchat.com/home/world/wrld_1234');
    expect(world.ok).toBe(false);
    expect(world.ok === false && world.error).toContain('ワールド');

    const group = parseVrchatProfile('https://vrchat.com/home/group/grp_1234');
    expect(group.ok === false && group.error).toContain('グループ');

    const avatar = parseVrchatProfile('https://vrchat.com/home/avatar/avtr_1234');
    expect(avatar.ok === false && avatar.error).toContain('アバター');
  });

  it('生のワールドID・グループIDも指摘する', () => {
    const result = parseVrchatProfile('wrld_d559169b-fee8-4d7c-b78f-2d0924666750');
    expect(result.ok === false && result.error).toContain('ワールド');
  });

  it('VRChat 以外のホストは弾く', () => {
    const result = parseVrchatProfile(`https://example.com/home/user/${USER_ID}`);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('example.com');
  });

  it('vrchat.com でも user を含まないパスは弾く', () => {
    expect(parseVrchatProfile('https://vrchat.com/home').ok).toBe(false);
  });

  it('空文字は弾く', () => {
    expect(parseVrchatProfile('   ').ok).toBe(false);
  });

  it('ID として読めない文字列は弾く', () => {
    expect(parseVrchatProfile('慕狼ゆに').ok).toBe(false);
    expect(parseVrchatProfile('https://vrchat.com/home/user/ゆに').ok).toBe(false);
  });
});

describe('profileUrl', () => {
  it('ユーザーIDからプロフィールURLを組み立てる', () => {
    expect(profileUrl(USER_ID)).toBe(`https://vrchat.com/home/user/${USER_ID}`);
  });
});

describe('VrcLinkStore', () => {
  let dir: string;
  let storePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vrc-links-test-'));
    storePath = join(dir, 'vrc-links.json');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('ファイルが無ければ空で初期化される', () => {
    expect(new VrcLinkStore(storePath).list()).toEqual([]);
    expect(new VrcLinkStore(storePath).get('discord-1')).toBeUndefined();
  });

  it('壊れた JSON は空として扱い、落ちない', () => {
    writeFileSync(storePath, '{ broken');
    expect(new VrcLinkStore(storePath).list()).toEqual([]);
  });

  it('登録した内容がファイルに永続化される', () => {
    new VrcLinkStore(storePath).set('discord-1', {
      vrcUserId: USER_ID,
      displayName: '慕狼ゆに',
      linkedBy: 'discord-1',
    });

    const link = new VrcLinkStore(storePath).get('discord-1');
    expect(link?.vrcUserId).toBe(USER_ID);
    expect(link?.displayName).toBe('慕狼ゆに');
    expect(link?.friendRequestSentAt).toBeNull();
    expect(JSON.parse(readFileSync(storePath, 'utf-8')).links['discord-1'].vrcUserId).toBe(USER_ID);
  });

  it('代理登録では登録操作をした人を linkedBy に残す', () => {
    const store = new VrcLinkStore(storePath);
    store.set('discord-target', { vrcUserId: USER_ID, displayName: 'ゆに', linkedBy: 'discord-actor' });

    expect(store.get('discord-target')?.linkedBy).toBe('discord-actor');
  });

  it('同じアカウントの再登録では申請済みの記録を引き継ぐ', () => {
    const store = new VrcLinkStore(storePath);
    store.set('discord-1', { vrcUserId: USER_ID, displayName: 'ゆに', linkedBy: 'discord-1' });
    store.markFriendRequestSent('discord-1', '2026-08-26T00:00:00.000Z');

    store.set('discord-1', { vrcUserId: USER_ID, displayName: 'ゆに（改名）', linkedBy: 'discord-1' });

    expect(store.get('discord-1')?.friendRequestSentAt).toBe('2026-08-26T00:00:00.000Z');
    expect(store.get('discord-1')?.displayName).toBe('ゆに（改名）');
  });

  it('別のアカウントに付け替えたら申請済みの記録は捨てる', () => {
    const store = new VrcLinkStore(storePath);
    store.set('discord-1', { vrcUserId: USER_ID, displayName: 'ゆに', linkedBy: 'discord-1' });
    store.markFriendRequestSent('discord-1');

    store.set('discord-1', { vrcUserId: '8JoV9XEdpo', displayName: '別垢', linkedBy: 'discord-1' });

    expect(store.get('discord-1')?.friendRequestSentAt).toBeNull();
  });

  it('remove は削除できたかを返す', () => {
    const store = new VrcLinkStore(storePath);
    store.set('discord-1', { vrcUserId: USER_ID, displayName: 'ゆに', linkedBy: 'discord-1' });

    expect(store.remove('discord-1')).toBe(true);
    expect(store.remove('discord-1')).toBe(false);
    expect(new VrcLinkStore(storePath).get('discord-1')).toBeUndefined();
  });
});
