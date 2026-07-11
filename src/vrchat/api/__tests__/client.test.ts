import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createClient, saveCookies } from '../client';

describe('createClient', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vrc-client-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('cookieFile を指定しない場合は cookieFile が undefined のクライアントを返す', async () => {
    const client = await createClient('MyApp/1.0 me@example.org');
    expect(client.cookieFile).toBeUndefined();
    expect(client.jar).toBeDefined();
  });

  it('cookieFile を指定してもファイルが存在しなければ新しい jar で作成する', async () => {
    const cookieFile = join(dir, 'cookies.json');
    const client = await createClient('MyApp/1.0 me@example.org', cookieFile);
    expect(client.cookieFile).toBe(cookieFile);
  });

  it('cookieFile の中身が壊れている場合は新しい jar にフォールバックする（例外を投げない）', async () => {
    const cookieFile = join(dir, 'cookies.json');
    writeFileSync(cookieFile, '{ this is not valid json');

    await expect(createClient('MyApp/1.0 me@example.org', cookieFile)).resolves.toBeDefined();
  });

  it('saveCookies で保存したセッションを createClient で復元できる', async () => {
    const cookieFile = join(dir, 'cookies.json');
    const first = await createClient('MyApp/1.0 me@example.org', cookieFile);
    await first.jar.setCookie('session=abc123; Domain=api.vrchat.cloud; Path=/', 'https://api.vrchat.cloud/');
    await saveCookies(first);

    expect(existsSync(cookieFile)).toBe(true);

    const second = await createClient('MyApp/1.0 me@example.org', cookieFile);
    const cookies = await second.jar.getCookies('https://api.vrchat.cloud/');
    expect(cookies.some(c => c.key === 'session' && c.value === 'abc123')).toBe(true);
  });
});

describe('saveCookies', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vrc-client-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('cookieFile が未設定なら何もしない（例外を投げない）', async () => {
    const client = await createClient('MyApp/1.0 me@example.org');
    await expect(saveCookies(client)).resolves.toBeUndefined();
  });

  it('存在しない親ディレクトリを自動作成して保存する', async () => {
    const cookieFile = join(dir, 'nested', 'dir', 'cookies.json');
    const client = await createClient('MyApp/1.0 me@example.org', cookieFile);

    await saveCookies(client);

    expect(existsSync(cookieFile)).toBe(true);
    expect(() => JSON.parse(readFileSync(cookieFile, 'utf-8'))).not.toThrow();
  });
});
