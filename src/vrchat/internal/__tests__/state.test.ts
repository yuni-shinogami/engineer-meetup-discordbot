import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveLatest } from '../state';

describe('saveLatest', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'state-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('shortName がある場合は invite_url に短縮URLを使う', () => {
    const stateFile = join(dir, 'latest.json');
    const state = saveLatest(stateFile, {
      worldId: 'wrld_1',
      instanceId: '123',
      location: 'wrld_1:123~group(grp_1)',
      launchUrl: 'https://vrchat.com/home/launch?worldId=wrld_1&instanceId=123',
      shortName: 'abcdef',
    });

    expect(state.invite_url).toBe('https://vrchat.com/i/abcdef');
    expect(state.launch_uri).toBe('vrchat://launch?id=wrld_1:123~group(grp_1)');
    expect(state.short_name).toBe('abcdef');
  });

  it('shortName が無い場合は invite_url に launchUrl をそのまま使う', () => {
    const stateFile = join(dir, 'latest.json');
    const state = saveLatest(stateFile, {
      worldId: 'wrld_1',
      instanceId: '123',
      location: 'wrld_1:123',
      launchUrl: 'https://vrchat.com/home/launch?worldId=wrld_1&instanceId=123',
    });

    expect(state.invite_url).toBe(state.launch_url);
    expect(state.short_name).toBeNull();
  });

  it('created_at は有効な ISO 日時文字列になる', () => {
    const stateFile = join(dir, 'latest.json');
    const state = saveLatest(stateFile, {
      worldId: 'w', instanceId: 'i', location: 'l', launchUrl: 'u',
    });

    expect(new Date(state.created_at).toISOString()).toBe(state.created_at);
  });

  it('ファイルに書き込んだ内容が戻り値と一致する', () => {
    const stateFile = join(dir, 'latest.json');
    const state = saveLatest(stateFile, {
      worldId: 'wrld_1', instanceId: '123', location: 'loc', launchUrl: 'url',
    });

    const saved = JSON.parse(readFileSync(stateFile, 'utf-8'));
    expect(saved).toEqual(state);
  });

  it('存在しない親ディレクトリを自動作成する', () => {
    const stateFile = join(dir, 'a', 'b', 'c', 'latest.json');
    saveLatest(stateFile, { worldId: 'w', instanceId: 'i', location: 'l', launchUrl: 'u' });

    expect(existsSync(stateFile)).toBe(true);
  });
});
