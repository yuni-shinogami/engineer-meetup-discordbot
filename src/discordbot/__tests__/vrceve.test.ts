import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  storage: { vrceveEditUrl: null as string | null },
  ltEntriesForMeetup: vi.fn(),
  config: { vrceveSshTarget: 'user@browser-desktop', vrceveSshKey: '/path/to/vrceve-key' },
}));

vi.mock('child_process', () => ({ execFile: mocks.execFile }));
vi.mock('../config', () => ({ config: mocks.config }));
vi.mock('../storage', () => ({ storage: mocks.storage }));
vi.mock('../lt/weekly-announce', () => ({
  nextMeetupDate: () => '2026-11-06',
  ltEntriesForMeetup: mocks.ltEntriesForMeetup,
}));

import { deleteFromVrceve, registerOnVrceve, vrceveFields } from '../vrceve';
import type { LtEntry } from '../lt/types';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

/** デスクトップ VM の返事。動詞ごとに返す JSON を決める。 */
function vmReplies(replies: Record<string, object>) {
  mocks.execFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: ExecCallback) => {
    const verb = args[args.length - 1]!.split(' ')[0]!;
    const reply = replies[verb] ?? { ok: false, error: `unexpected ${verb}` };
    cb('ok' in reply && reply.ok ? null : new Error('Command failed'), `${JSON.stringify(reply)}\n`, '');
  });
}

function sentPayload(): { fields?: Record<string, unknown>; dry_run?: boolean; edit_url?: string } {
  const request = (mocks.execFile.mock.calls[0]![1] as string[]).slice(-1)[0]!;
  return JSON.parse(Buffer.from(request.split(' ')[1]!, 'base64url').toString('utf-8'));
}

function lt(title: string, speakerName: string): LtEntry {
  return { title, speakerName } as LtEntry;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.vrceveEditUrl = null;
  mocks.ltEntriesForMeetup.mockReturnValue([]);
  mocks.config.vrceveSshTarget = 'user@browser-desktop';
});

describe('vrceveFields', () => {
  it('LT がない週は集会名だけで、22:00〜23:30 に登録する', () => {
    const fields = vrceveFields('2026-11-06', []);

    expect(fields.name).toBe('エンジニア集会');
    expect(fields.start).toBe('2026-11-06 22:00');
    expect(fields.end).toBe('2026-11-06 23:30');
    expect(fields.android).toBe('PC/android');
    expect(fields.description).not.toContain('LT');
  });

  it('LT がある週は、イベント名に「LTあり」とタイトルを、内容に LT の一覧を足す', () => {
    const fields = vrceveFields('2026-11-06', [lt('自作OSの話', 'A'), lt('未定', 'B')]);

    // タイトル未定の LT はイベント名には出さない
    expect(fields.name).toBe('エンジニア集会【LTあり】自作OSの話');
    expect(fields.description).toContain('【今週の LT】\n・「自作OSの話」 / A\n・（タイトル未定） / B');
  });

  it('イベント名が長くなりすぎないよう切り詰める', () => {
    const fields = vrceveFields('2026-11-06', [lt('あ'.repeat(40), 'A'), lt('い'.repeat(40), 'B')]);

    expect(fields.name.length).toBe(60);
    expect(fields.name.endsWith('…')).toBe(true);
  });
});

describe('registerOnVrceve', () => {
  it('本番では送信して、編集用 URL を控える', async () => {
    vmReplies({ register: { ok: true, edit_url: 'https://docs.google.com/forms/d/e/x/viewform?edit2=abc' } });
    mocks.ltEntriesForMeetup.mockReturnValue([lt('自作OSの話', 'A')]);

    const report = await registerOnVrceve(true);

    expect(mocks.ltEntriesForMeetup).toHaveBeenCalledWith('2026-11-06', true);
    const payload = sentPayload();
    expect(payload.dry_run).toBeUndefined();
    expect(payload.fields?.name).toBe('エンジニア集会【LTあり】自作OSの話');
    expect(mocks.storage.vrceveEditUrl).toBe('https://docs.google.com/forms/d/e/x/viewform?edit2=abc');
    expect(report?.content).toContain('登録しました');
    expect(report?.content).toContain('edit2=abc');
  });

  it('テストでは送らずに、入力した画面を添付する', async () => {
    vmReplies({ register: { ok: true, dry_run: true, images: [Buffer.from('jpg1').toString('base64'), Buffer.from('jpg2').toString('base64')] } });

    const report = await registerOnVrceve(false);

    expect(sentPayload().dry_run).toBe(true);
    expect(mocks.storage.vrceveEditUrl).toBeNull();
    expect(report?.content).toContain('送信していません');
    expect(report?.files).toHaveLength(2);
  });

  // YES を押し直しても二重に登録しない
  it('登録済みなら送らない', async () => {
    mocks.storage.vrceveEditUrl = 'https://docs.google.com/forms/d/e/x/viewform?edit2=abc';

    const report = await registerOnVrceve(true);

    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(report?.content).toContain('登録済み');
  });

  it('VM でログインが切れていたら、理由を返して控えは変えない', async () => {
    vmReplies({ register: { ok: false, error: 'Google に engineer.meetup0928@gmail.com でログインしていません' } });

    const report = await registerOnVrceve(true);

    expect(report?.content).toContain('ログインしていません');
    expect(mocks.storage.vrceveEditUrl).toBeNull();
  });

  it('接続先が設定されていなければ何もしない', async () => {
    mocks.config.vrceveSshTarget = '';

    expect(await registerOnVrceve(true)).toBeNull();
    expect(mocks.execFile).not.toHaveBeenCalled();
  });
});

describe('deleteFromVrceve', () => {
  it('控えた編集用 URL から削除し、控えを消す', async () => {
    mocks.storage.vrceveEditUrl = 'https://docs.google.com/forms/d/e/x/viewform?edit2=abc';
    vmReplies({ delete: { ok: true, deleted: true } });

    const report = await deleteFromVrceve();

    expect(sentPayload().edit_url).toBe('https://docs.google.com/forms/d/e/x/viewform?edit2=abc');
    expect(mocks.storage.vrceveEditUrl).toBeNull();
    expect(report?.content).toContain('削除しました');
  });

  it('削除できなければ、手で取り消せるよう編集用 URL を出す', async () => {
    mocks.storage.vrceveEditUrl = 'https://docs.google.com/forms/d/e/x/viewform?edit2=abc';
    vmReplies({ delete: { ok: false, error: 'timeout' } });

    const report = await deleteFromVrceve();

    expect(report?.content).toContain('edit2=abc');
    expect(mocks.storage.vrceveEditUrl).not.toBeNull();
  });

  it('登録していなければ何もしない', async () => {
    expect(await deleteFromVrceve()).toBeNull();
    expect(mocks.execFile).not.toHaveBeenCalled();
  });
});
