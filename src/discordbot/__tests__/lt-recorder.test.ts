import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ButtonInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  readLatest: vi.fn(),
  store: { get: vi.fn(), entriesOnDate: vi.fn() },
  config: {
    ltRecorderSshTarget: 'user@vrchat-pc',
    ltRecorderSshKey: '/path/to/recorder-key',
  },
}));

vi.mock('child_process', () => ({ execFile: mocks.execFile }));
vi.mock('../config', () => ({ config: mocks.config }));
vi.mock('../lt/store', () => ({ ltStore: mocks.store }));
vi.mock('../vrc-launcher', () => ({
  readLatest: mocks.readLatest,
  instanceNameOf: (location: string) => location.split(':')[1]?.split('~')[0] ?? '',
}));
vi.mock('../commands/utils', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ エラーが発生しました: ${e instanceof Error ? e.message : String(e)}`,
}));

import {
  callRecorder,
  handleLtRecordMarkButton,
  handleLtRecordStartButton,
  handleLtRecordStopConfirm,
  handleRadioPrepButton,
  ltRecordStartButton,
  radioPrepButton,
  recordingPanelRows,
  renderStatus,
  type RecorderStatus,
} from '../lt-recorder';
import type { LtEntry } from '../lt/types';

const LOCATION = 'wrld_585f45ea-c6a6-4ba5-ad6a-188dd822f574:45350~group(grp_5a802e77-a436-491a-9edb-39fca4ff7805)~groupAccessType(plus)~region(jp)';

type ExecCallback = (error: Error | null, stdout: Buffer, stderr: Buffer) => void;

/** 録画 PC の返事。動詞ごとに返す JSON を決める（日本語は録画スクリプトと同じく \uXXXX で返す）。 */
function recorderReplies(replies: Record<string, object>) {
  mocks.execFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: ExecCallback) => {
    const verb = args[args.length - 1]!.split(' ')[0]!;
    const reply = replies[verb] ?? { ok: false, error: `unexpected ${verb}` };
    const json = JSON.stringify(reply).replace(/[\u0080-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    cb(reply && 'ok' in reply && reply.ok ? null : new Error('Command failed'), Buffer.from(`${json}\r\n`), Buffer.from(''));
  });
}

function sentRequests(): string[] {
  return mocks.execFile.mock.calls.map(call => (call[1] as string[]).slice(-1)[0]!);
}

function decodePayload(request: string): unknown {
  return JSON.parse(Buffer.from(request.split(' ')[1]!, 'base64url').toString('utf-8'));
}

const RECORDING: RecorderStatus = {
  session: '20261106-210000',
  state: 'recording',
  event: 'エンジニア集会',
  error: null,
  marks: [],
  clips: [],
};

function entry(id: string, speakerName: string): LtEntry {
  return {
    id,
    speakerName,
    title: `${speakerName}の話`,
    archivePolicy: 'unlisted',
  } as LtEntry;
}

function interaction(extra: Record<string, unknown> = {}) {
  return {
    message: { id: 'panel-message' },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    ...extra,
  } as unknown as ButtonInteraction & Record<
    'reply' | 'deferReply' | 'deferUpdate' | 'update' | 'editReply' | 'followUp',
    ReturnType<typeof vi.fn>
  >;
}

function customIds(rows: ReturnType<typeof recordingPanelRows>): string[][] {
  return rows.map(row => row.toJSON().components.map(c => (c as { custom_id: string }).custom_id));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readLatest.mockReturnValue({ location: LOCATION });
  mocks.store.entriesOnDate.mockReturnValue([]);
  recorderReplies({ status: { ok: true, ...RECORDING } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('callRecorder', () => {
  it('録画用の鍵で接続し、送るのは動詞と base64url の JSON だけにする', async () => {
    recorderReplies({ mark: { ok: true, index: 1, t: '0:01:02' } });

    const result = await callRecorder('mark', { lt_id: '1', title: '自作OSの話' });

    const [cmd, args] = mocks.execFile.mock.calls[0]!;
    expect(cmd).toBe('ssh');
    expect(args).toContain('/path/to/recorder-key');
    expect(args).toContain('StrictHostKeyChecking=yes');
    const request = (args as string[]).slice(-1)[0]!;
    expect(request).toMatch(/^mark [A-Za-z0-9_-]+$/);
    expect(decodePayload(request)).toEqual({ lt_id: '1', title: '自作OSの話' });
    expect(result).toEqual({ index: 1, t: '0:01:02' });
  });

  it('録画スクリプトが断った理由をそのまま返す', async () => {
    recorderReplies({ start: { ok: false, error: 'VRChat が起動していません' } });

    await expect(callRecorder('start', {})).rejects.toThrow('VRChat が起動していません');
  });

  it('JSON が返らなければ接続先のエラーを Shift_JIS から読める形にして返す', async () => {
    const sjis = Buffer.from([0x8e, 0xb8, 0x94, 0x73]); // 「失敗」
    mocks.execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
      cb(new Error('Command failed'), Buffer.from(''), sjis);
    });

    await expect(callRecorder('status')).rejects.toThrow('失敗');
  });
});

describe('ltRecordStartButton', () => {
  it('インスタンス名と本番かどうかをボタンに持たせる', () => {
    expect(ltRecordStartButton(LOCATION, true).toJSON()).toMatchObject({ custom_id: 'ltrec:start:45350:1' });
    expect(ltRecordStartButton(LOCATION, false).toJSON()).toMatchObject({ custom_id: 'ltrec:start:45350:0' });
  });
});

describe('recordingPanelRows', () => {
  it('登壇者ごとの開始ボタンを 5 個ずつ並べ、最後の行に操作ボタンを置く', () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry(`${i}`, `登壇者${i}`));

    const ids = customIds(recordingPanelRows(entries));

    expect(ids).toEqual([
      ['ltrec:mark:0', 'ltrec:mark:1', 'ltrec:mark:2', 'ltrec:mark:3', 'ltrec:mark:4'],
      ['ltrec:mark:5'],
      ['ltrec:end', 'ltrec:status', 'ltrec:stop'],
    ]);
  });

  it('LT が無くても操作ボタンは出す', () => {
    expect(customIds(recordingPanelRows([]))).toEqual([['ltrec:end', 'ltrec:status', 'ltrec:stop']]);
  });
});

describe('renderStatus', () => {
  it('録画中は記録した区切りを並べる', () => {
    const text = renderStatus({
      ...RECORDING,
      marks: [
        { t: '0:01:02', lt_id: '1', title: '自作OSの話' },
        { t: '0:06:30', lt_id: null, title: null },
      ],
    });

    expect(text).toContain('▶ 0:01:02 自作OSの話');
    expect(text).toContain('⏸ 0:06:30 区切り');
    expect(text).not.toContain('⚠️');
  });

  it('録画中に VRChat が固まっていれば、立て直し方と一緒に知らせる', () => {
    const text = renderStatus({ ...RECORDING, vrchat_hang: 'VRChat が固まっているようです（ログが 0:02:10 止まっています）' });

    expect(text).toContain('⚠️ VRChat が固まっているようです（ログが 0:02:10 止まっています）');
    expect(text).toContain('「🖥️ サブアカウントで入る」で VRChat を起動し直して');
  });

  it('完了したら動画の URL と、公開範囲の切り替え方を archivePolicy ごとに出す', () => {
    const text = renderStatus({
      ...RECORDING,
      state: 'done',
      clips: [
        { lt_id: '1', title: '自作OSの話', speaker: 'A', archive_policy: 'public', video_id: 'abc', privacy: 'private' },
        { lt_id: '2', title: '限定の話', speaker: 'B', archive_policy: 'unlisted', video_id: 'def', privacy: 'private' },
        { lt_id: '3', title: '非公開の話', speaker: 'C', archive_policy: 'none', video_id: null, privacy: null },
      ],
    });

    expect(text).toContain('https://youtu.be/abc');
    expect(text).toMatch(/一般公開OK → Studio で「公開」に切り替え/);
    expect(text).toMatch(/限定公開（Discord内のみ） → Studio で「限定公開」に切り替え.*https:\/\/youtu.be\/def/);
    expect(text).toMatch(/録画の公開なし → アップロードしていません$/m);
  });

  it('失敗したら理由を出す', () => {
    expect(renderStatus({ ...RECORDING, state: 'error', error: 'ffmpeg failed' })).toContain('ffmpeg failed');
  });

  // YouTube を認可する前は編集までで止まる。アップロード済みのような案内をしない
  it('編集だけ終わったら、アップロードしていないことと書き出したファイルを出す', () => {
    const text = renderStatus({
      ...RECORDING,
      state: 'edited',
      clips: [
        { lt_id: '1', title: '自作OSの話', speaker: 'A', archive_policy: 'public', video_id: null, privacy: null, file: '01_自作OSの話.mp4' },
        { lt_id: '2', title: '短い話', speaker: 'B', archive_policy: 'unlisted', video_id: null, privacy: null, file: null, skipped: '短すぎる（12秒）' },
        { lt_id: '3', title: '非公開の話', speaker: 'C', archive_policy: 'none', video_id: null, privacy: null, file: null },
      ],
    });

    expect(text).toContain('アップロードはしていません');
    expect(text).toContain(RECORDING.session);
    expect(text).toMatch(/一般公開OK → 01_自作OSの話\.mp4$/m);
    expect(text).toMatch(/→ 切り出していません（短すぎる（12秒））$/m);
    expect(text).toMatch(/録画の公開なし → アップロードしていません$/m);
    expect(text).not.toContain('Studio');
  });
});

describe('handleLtRecordStartButton', () => {
  it('最新のインスタンスで録画を始め、今日の LT のボタン付きパネルを出す', async () => {
    recorderReplies({
      start: { ok: true, session: RECORDING.session, moved: 'ひな壇前' },
      status: { ok: true, ...RECORDING },
    });
    mocks.store.entriesOnDate.mockReturnValue([entry('thread-1', 'A')]);
    const i = interaction();

    await handleLtRecordStartButton(i, ['45350', '1']);

    const start = sentRequests()[0]!;
    expect(decodePayload(start)).toEqual({ location: LOCATION, event: 'エンジニア集会' });
    expect(mocks.store.entriesOnDate).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), true);
    const panel = i.editReply.mock.calls.slice(-1)[0]![0];
    expect(panel.content).toContain('録画中');
    expect(customIds(panel.components)[0]).toEqual(['ltrec:mark:thread-1']);
  });

  it('録画中は VRChat が固まっていないか見張り、固まったらチャンネルに 1 回だけ知らせる', async () => {
    vi.useFakeTimers();
    const channel = { isSendable: () => true, send: vi.fn().mockResolvedValue(undefined) };
    recorderReplies({
      start: { ok: true, session: RECORDING.session, moved: 'ひな壇前' },
      status: { ok: true, ...RECORDING },
    });

    await handleLtRecordStartButton(interaction({ channel }), ['45350', '1']);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(channel.send).not.toHaveBeenCalled();

    const hang = 'VRChat が固まっているようです（ログが 0:01:30 止まっています）';
    recorderReplies({ status: { ok: true, ...RECORDING, vrchat_hang: hang } });
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledWith(expect.stringContaining(hang));

    // 録画が終わったら見張りもやめる
    recorderReplies({ status: { ok: true, ...RECORDING, state: 'processing', vrchat_hang: hang } });
    await vi.advanceTimersByTimeAsync(60_000);
    const calls = mocks.execFile.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.execFile.mock.calls.length).toBe(calls);
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  // 古いメッセージのボタンで、別のインスタンスにいるサブアカウントを録画し始めないようにする
  it('後から別のインスタンスが作られていれば録画しない', async () => {
    const i = interaction();

    await handleLtRecordStartButton(i, ['11111', '1']);

    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('録画を始められなければ理由を返す', async () => {
    recorderReplies({ start: { ok: false, error: 'VRChat がまだインスタンスに入っていません' } });
    const i = interaction();

    await handleLtRecordStartButton(i, ['45350', '0']);

    expect(i.editReply).toHaveBeenLastCalledWith(expect.stringContaining('まだインスタンスに入っていません'));
  });
});

describe('handleLtRecordMarkButton', () => {
  it('LT の情報と archivePolicy を送り、パネルの本文を書き換える', async () => {
    mocks.store.get.mockReturnValue({ ...entry('thread-1', 'A'), archivePolicy: 'public' });
    recorderReplies({
      mark: { ok: true, index: 1, t: '0:01:02' },
      status: { ok: true, ...RECORDING, marks: [{ t: '0:01:02', lt_id: 'thread-1', title: 'Aの話' }] },
    });
    const i = interaction();

    await handleLtRecordMarkButton(i, ['thread-1']);

    expect(decodePayload(sentRequests()[0]!)).toEqual({
      lt_id: 'thread-1', title: 'Aの話', speaker: 'A', archive_policy: 'public',
    });
    expect(i.editReply).toHaveBeenCalledWith({ content: expect.stringContaining('▶ 0:01:02 Aの話') });
  });

  it('録画していなければ押した本人にだけ理由を返す', async () => {
    mocks.store.get.mockReturnValue(entry('thread-1', 'A'));
    recorderReplies({ mark: { ok: false, error: '録画中のセッションがありません' } });
    const i = interaction();

    await handleLtRecordMarkButton(i, ['thread-1']);

    expect(i.followUp).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('録画中のセッションがありません'),
      ephemeral: true,
    }));
  });
});

describe('handleLtRecordStopConfirm', () => {
  it('録画を止めてパネルを処理中にし、終わったらチャンネルに報告する', async () => {
    vi.useFakeTimers();
    const panel = { edit: vi.fn().mockResolvedValue(undefined) };
    const channel = {
      messages: { fetch: vi.fn().mockResolvedValue(panel) },
      isSendable: () => true,
      send: vi.fn().mockResolvedValue(undefined),
    };
    recorderReplies({
      stop: { ok: true, session: RECORDING.session, duration: '1:02:03', lts: 2 },
      status: { ok: true, ...RECORDING, state: 'processing' },
    });
    const i = interaction({ channel });

    await handleLtRecordStopConfirm(i, ['panel-message']);

    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('1:02:03、LT 2 本'));
    expect(channel.messages.fetch).toHaveBeenCalledWith('panel-message');
    expect(panel.edit).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('切り分けています') }));

    recorderReplies({
      status: {
        ok: true,
        ...RECORDING,
        state: 'done',
        clips: [{ lt_id: '1', title: 'Aの話', speaker: 'A', archive_policy: 'public', video_id: 'abc', privacy: 'private' }],
      },
    });
    await vi.advanceTimersByTimeAsync(2 * 60_000);

    expect(channel.send).toHaveBeenCalledWith(expect.stringContaining('https://youtu.be/abc'));
  });

  it('編集だけで止まった場合も、終わったものとしてチャンネルに報告する', async () => {
    vi.useFakeTimers();
    const channel = {
      messages: { fetch: vi.fn().mockResolvedValue({ edit: vi.fn().mockResolvedValue(undefined) }) },
      isSendable: () => true,
      send: vi.fn().mockResolvedValue(undefined),
    };
    recorderReplies({
      stop: { ok: true, session: RECORDING.session, duration: '0:30:00', lts: 1 },
      status: { ok: true, ...RECORDING, state: 'processing' },
    });

    await handleLtRecordStopConfirm(interaction({ channel }), ['panel-message']);
    recorderReplies({
      status: {
        ok: true,
        ...RECORDING,
        state: 'edited',
        clips: [{ lt_id: '1', title: 'Aの話', speaker: 'A', archive_policy: 'public', video_id: null, privacy: null, file: '01_Aの話.mp4' }],
      },
    });
    await vi.advanceTimersByTimeAsync(2 * 60_000);

    expect(channel.send).toHaveBeenCalledWith(expect.stringContaining('01_Aの話.mp4'));
  });
});

describe('ラジオ準備', () => {
  it('ボタンは最新のインスタンスに結びつく', () => {
    const json = radioPrepButton(LOCATION).toJSON() as { custom_id: string; label: string };
    expect(json.custom_id).toBe('ltrec:radio:45350');
    expect(json.label).toContain('ラジオ準備');
  });

  it('最新のインスタンスで準備し、OBS のシーンと配信の始め方を返す', async () => {
    recorderReplies({ radio: { ok: true, moved: 'ラジオブース', scene: 'エンジニア集会アフターラジオ' } });
    const i = interaction();

    await handleRadioPrepButton(i, ['45350']);

    const request = sentRequests()[0]!;
    expect(request.startsWith('radio ')).toBe(true);
    expect(decodePayload(request)).toEqual({ location: LOCATION });
    // ワープ・カメラの準備まで待つので、録画開始と同じ長いタイムアウトにする
    expect((mocks.execFile.mock.calls[0]![2] as { timeout: number }).timeout).toBe(150_000);
    expect(i.editReply).toHaveBeenLastCalledWith(expect.stringContaining('エンジニア集会アフターラジオ'));
    expect(i.editReply).toHaveBeenLastCalledWith(expect.stringContaining('配信を開始'));
  });

  it('後から別のインスタンスが作られていれば準備しない', async () => {
    const i = interaction();

    await handleRadioPrepButton(i, ['11111']);

    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('準備できなければ理由を返す', async () => {
    recorderReplies({ radio: { ok: false, error: 'ストリームカメラの映像が OBS に届いていません' } });
    const i = interaction();

    await handleRadioPrepButton(i, ['45350']);

    expect(i.editReply).toHaveBeenLastCalledWith(expect.stringContaining('ストリームカメラの映像'));
  });
});
