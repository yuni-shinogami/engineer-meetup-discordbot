import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ButtonInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  readFileSync: vi.fn(),
  config: {
    vrcStateDir: '/state',
    vrcLauncherSshTarget: 'user@vrchat-pc',
    vrcLauncherSshKey: '/path/to/key',
  },
}));

vi.mock('child_process', () => ({ execFile: mocks.execFile }));
vi.mock('fs', () => ({ readFileSync: mocks.readFileSync }));
vi.mock('../config', () => ({ config: mocks.config }));
vi.mock('../commands/utils', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ エラーが発生しました: ${e instanceof Error ? e.message : String(e)}`,
}));

import { handleJoinSubButton, instanceNameOf, requestSubAccountJoin } from '../vrc-launcher';

const LOCATION = 'wrld_585f45ea-c6a6-4ba5-ad6a-188dd822f574:45350~group(grp_5a802e77-a436-491a-9edb-39fca4ff7805)~groupAccessType(plus)~region(jp)';

type ExecCallback = (error: Error | null, stdout: Buffer, stderr: Buffer) => void;

function execSucceeds() {
  mocks.execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
    cb(null, Buffer.from(''), Buffer.from(''));
  });
}

function interaction() {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ButtonInteraction & Record<'reply' | 'deferReply' | 'editReply', ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readFileSync.mockReturnValue(JSON.stringify({ location: LOCATION }));
  execSucceeds();
});

describe('instanceNameOf', () => {
  it('location からインスタンス名だけを取り出す', () => {
    expect(instanceNameOf(LOCATION)).toBe('45350');
  });
});

describe('requestSubAccountJoin', () => {
  it('鍵と接続先を指定し、送るのは location だけにする', async () => {
    await requestSubAccountJoin(LOCATION);

    const [cmd, args] = mocks.execFile.mock.calls[0]!;
    expect(cmd).toBe('ssh');
    expect(args).toContain('/path/to/key');
    expect(args).toContain('StrictHostKeyChecking=yes');
    expect(args.slice(-2)).toEqual(['user@vrchat-pc', LOCATION]);
  });

  // 接続先の起動スクリプトでも検証しているが、形式の崩れた文字列はそもそも SSH に流さない
  it('location の形式が崩れていれば SSH しない', async () => {
    await expect(requestSubAccountJoin(`${LOCATION}; calc.exe`)).rejects.toThrow('形式が不正');
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it('接続先のエラーを Shift_JIS から読める形にして返す', async () => {
    const sjis = Buffer.from([0x8e, 0xb8, 0x94, 0x73]); // 「失敗」
    mocks.execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
      cb(new Error('Command failed'), Buffer.from(''), sjis);
    });

    await expect(requestSubAccountJoin(LOCATION)).rejects.toThrow('失敗');
  });
});

describe('handleJoinSubButton', () => {
  it('最新のインスタンスのボタンならサブアカウントを入室させる', async () => {
    const i = interaction();

    await handleJoinSubButton(i, ['45350']);

    expect(mocks.execFile).toHaveBeenCalledTimes(1);
    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('起動しました'));
  });

  // 古いメッセージのボタンで、後から作った別のインスタンスに入ってしまわないようにする
  it('後から別のインスタンスが作られていれば入室させない', async () => {
    const i = interaction();

    await handleJoinSubButton(i, ['11111']);

    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('起動に失敗したら理由を返す', async () => {
    mocks.execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
      cb(new Error('ssh: connect to host vrchat-pc port 22: Connection timed out'), Buffer.from(''), Buffer.from(''));
    });
    const i = interaction();

    await handleJoinSubButton(i, ['45350']);

    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('Connection timed out'));
  });
});
