import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LtStore } from '../store';
import { LtEntryInput } from '../types';

const draft = (over: Partial<LtEntryInput> = {}): LtEntryInput => ({
  id: '1000',
  speakerId: 'user-1',
  speakerName: 'ゆに',
  title: 'TypeScript の型で遊ぶ',
  durationMin: 10,
  capturePolicy: 'allowed',
  archivePolicy: 'public',
  ...over,
});

describe('LtStore', () => {
  let dir: string;
  let storePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lt-store-test-'));
    storePath = join(dir, 'lt-store.json');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('ファイルが無ければ空で初期化される', () => {
    expect(new LtStore(storePath).list()).toEqual([]);
  });

  it('create は applied 状態のレコードを作って保存する', () => {
    const entry = new LtStore(storePath).create(draft());

    expect(entry.status).toBe('applied');
    expect(entry.eventDate).toBeNull();
    expect(entry.preferredDates).toEqual([]);
    expect(entry.materials.speakerIconPath).toBeNull();
    expect(entry.announce.x).toEqual({ ref: null, postedAt: null });

    const saved = JSON.parse(readFileSync(storePath, 'utf-8'));
    expect(saved.entries).toHaveLength(1);
    expect(saved.entries[0].title).toBe('TypeScript の型で遊ぶ');
  });

  it('新しいインスタンスは保存済みのレコードを読み込む', () => {
    new LtStore(storePath).create(draft());
    expect(new LtStore(storePath).get('1000')?.speakerName).toBe('ゆに');
  });

  it('同じ ID の二重登録は拒否する', () => {
    const store = new LtStore(storePath);
    store.create(draft());
    expect(() => store.create(draft())).toThrow(/既に存在します/);
  });

  it('update は patch をマージし updatedAt を進める', () => {
    const store = new LtStore(storePath);
    const created = store.create(draft(), '2026-08-01T00:00:00.000Z');

    const updated = store.update('1000', { status: 'scheduled', eventDate: '2026-08-14' });

    expect(updated.status).toBe('scheduled');
    expect(updated.eventDate).toBe('2026-08-14');
    expect(updated.title).toBe(created.title);
    expect(updated.createdAt).toBe('2026-08-01T00:00:00.000Z');
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('存在しない ID の update はエラーになる', () => {
    expect(() => new LtStore(storePath).update('nope', { status: 'done' })).toThrow(/見つかりません/);
  });

  it('remove は削除できたかを返す', () => {
    const store = new LtStore(storePath);
    store.create(draft());
    expect(store.remove('1000')).toBe(true);
    expect(store.remove('1000')).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('findBySpeaker はステータスで絞り込める', () => {
    const store = new LtStore(storePath);
    store.create(draft({ id: '1' }));
    store.create(draft({ id: '2' }));
    store.create(draft({ id: '3', speakerId: 'user-2' }));
    store.update('2', { status: 'done' });

    expect(store.findBySpeaker('user-1')).toHaveLength(2);
    expect(store.findBySpeaker('user-1', ['applied'])).toHaveLength(1);
    expect(store.findBySpeaker('user-2', ['applied'])).toHaveLength(1);
  });

  it('slotUsageByDate は取り下げと日程未定を数えない', () => {
    const store = new LtStore(storePath);
    store.create(draft({ id: '1' }));
    store.create(draft({ id: '2' }));
    store.create(draft({ id: '3' }));
    store.update('1', { status: 'scheduled', eventDate: '2026-08-14' });
    store.update('2', { status: 'ready', eventDate: '2026-08-14' });
    store.update('3', { status: 'cancelled', eventDate: '2026-08-14' });

    expect(store.slotUsageByDate().get('2026-08-14')).toBe(2);
    expect(store.entriesOnDate('2026-08-14')).toHaveLength(2);
  });

  it('保存時に一時ファイルを残さない', () => {
    new LtStore(storePath).create(draft());
    expect(existsSync(`${storePath}.tmp`)).toBe(false);
  });

  it('壊れた JSON は空として読み込み、既存の処理を止めない', () => {
    writeFileSync(storePath, '{ broken');
    expect(new LtStore(storePath).list()).toEqual([]);
  });
});
