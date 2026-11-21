import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MatchStore } from '../store';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'match-store-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const read = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8'));

function joined(store: MatchStore, discordId: string, vrcUserId: string) {
  store.startPending(discordId, { vrcUserId, displayName: vrcUserId, code: 'EM-AAAAAA', expiresAt: '' });
  return store.confirm(discordId, '2026-11-21T00:00:00.000Z');
}

describe('MatchStore', () => {
  it('本人確認が済むと申し込みになり、分析に渡す一覧には VRChat の ID だけが入る', () => {
    const store = new MatchStore(dir);
    store.startPending('d1', { vrcUserId: 'usr_1', displayName: 'いち', code: 'EM-AAAAAA', expiresAt: '' });
    expect(store.getOptin('d1')).toBeUndefined();
    expect(read('optin-ids.json')).toEqual([]);

    expect(joined(store, 'd1', 'usr_1')).toMatchObject({ vrcUserId: 'usr_1' });
    expect(store.getPending('d1')).toBeUndefined();
    expect(read('optin-ids.json')).toEqual(['usr_1']);
    // 作り直しても残っている
    expect(new MatchStore(dir).getOptin('d1')).toMatchObject({ vrcUserId: 'usr_1' });
  });

  it('同じ VRChat アカウントで別の人が本人確認をしたら、前の申し込みを外す', () => {
    const store = new MatchStore(dir);
    joined(store, 'd1', 'usr_1');
    joined(store, 'd2', 'usr_1');
    expect(store.getOptin('d1')).toBeUndefined();
    expect(store.getOptin('d2')).toMatchObject({ vrcUserId: 'usr_1' });
  });

  it('今夜の記録は回ごとで、古い回は捨てる', () => {
    const store = new MatchStore(dir);
    store.checkIn('2026-11-07', 'd1');
    store.checkIn('2026-11-14', 'd1');
    expect(store.checkIn('2026-11-21', 'd2')).toEqual(['d2']);
    expect(store.checkIn('2026-11-21', 'd1')).toEqual(['d2', 'd1']);
    expect(store.checkIn('2026-11-21', 'd1')).toEqual(['d2', 'd1']);
    expect(Object.keys(read('state.json').checkins)).toEqual(['2026-11-14', '2026-11-21']);
  });

  it('やめると、申し込み・今夜の記録・プロフィールをすぐ消す', () => {
    const store = new MatchStore(dir);
    joined(store, 'd1', 'usr_1');
    joined(store, 'd2', 'usr_2');
    store.checkIn('2026-11-21', 'd1');
    fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({
      generatedAt: 'x',
      profiles: { usr_1: { mix: [1], group: 'Web', tags: [] }, usr_2: { mix: [1], group: 'Web', tags: [] } },
    }));

    expect(store.remove('d1')).toBe(true);
    expect(store.getOptin('d1')).toBeUndefined();
    expect(read('state.json').checkins['2026-11-21']).toEqual([]);
    expect(read('optin-ids.json')).toEqual(['usr_2']);
    expect(Object.keys(store.profiles().profiles)).toEqual(['usr_2']);
    expect(store.remove('d1')).toBe(false);
  });

  it('プロフィールがまだなければ空', () => {
    expect(new MatchStore(dir).profiles()).toEqual({ generatedAt: '', profiles: {} });
  });
});
