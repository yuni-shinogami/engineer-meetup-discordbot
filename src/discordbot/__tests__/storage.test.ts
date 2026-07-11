import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { config } from '../config';
import { Storage } from '../storage';

describe('Storage', () => {
  let dir: string;
  let storagePath: string;
  let originalStoragePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'storage-test-'));
    storagePath = join(dir, 'storage.json');
    originalStoragePath = config.storagePath;
    config.storagePath = storagePath;
  });

  afterEach(() => {
    config.storagePath = originalStoragePath;
    rmSync(dir, { recursive: true, force: true });
  });

  it('ファイルが存在しない場合はデフォルト値で初期化される', () => {
    const storage = new Storage();
    expect(storage.isScheduled).toBe(false);
    expect(storage.lastTweetId).toBeNull();
    expect(storage.preAnnouncePostUrl).toBeNull();
    expect(storage.lastInviteUrl).toBeNull();
  });

  it('setter を呼ぶと即座にファイルへ保存される', () => {
    const storage = new Storage();
    storage.lastTweetId = '12345';

    const saved = JSON.parse(readFileSync(storagePath, 'utf-8'));
    expect(saved.lastTweetId).toBe('12345');
  });

  it('新しいインスタンスは保存済みの値を読み込む', () => {
    const first = new Storage();
    first.isScheduled = true;
    first.lastTweetId = '999';
    first.preAnnouncePostUrl = 'https://x.com/foo/status/999';
    first.lastInviteUrl = 'https://vrchat.com/i/abcdef';

    const second = new Storage();
    expect(second.isScheduled).toBe(true);
    expect(second.lastTweetId).toBe('999');
    expect(second.preAnnouncePostUrl).toBe('https://x.com/foo/status/999');
    expect(second.lastInviteUrl).toBe('https://vrchat.com/i/abcdef');
  });

  it('一部のフィールドのみ保存されていてもデフォルト値で補完される', () => {
    const first = new Storage();
    first.lastTweetId = '111';

    const second = new Storage();
    expect(second.lastTweetId).toBe('111');
    expect(second.isScheduled).toBe(false);
    expect(second.lastInviteUrl).toBeNull();
  });
});
