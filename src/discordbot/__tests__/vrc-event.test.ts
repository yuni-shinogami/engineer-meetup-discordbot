import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  storage: { vrcEvent: null as { groupId: string; eventId: string } | null },
  ltEntriesForMeetup: vi.fn(),
  createMeetupEvent: vi.fn(),
  deleteMeetupEvent: vi.fn(),
}));

vi.mock('../storage', () => ({ storage: mocks.storage }));
vi.mock('../lt/weekly-announce', () => ({
  nextMeetupDate: () => '2026-11-06',
  ltEntriesForMeetup: mocks.ltEntriesForMeetup,
}));
vi.mock('../../vrchat/groupEvent', () => ({
  createMeetupEvent: mocks.createMeetupEvent,
  deleteMeetupEvent: mocks.deleteMeetupEvent,
}));
vi.mock('../config', () => ({ config: { vrceveSshTarget: '', vrceveSshKey: '' } }));

import { deleteVrcEvent, jstToIso, registerVrcEvent } from '../vrc-event';
import type { LtEntry } from '../lt/types';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.vrcEvent = null;
  mocks.ltEntriesForMeetup.mockReturnValue([]);
  mocks.createMeetupEvent.mockResolvedValue({ groupId: 'grp_prod', eventId: 'cal_1' });
  mocks.deleteMeetupEvent.mockResolvedValue(undefined);
});

describe('registerVrcEvent', () => {
  it('次の開催日の 22:00〜23:30（日本時間）で作り、控えを残す', async () => {
    mocks.ltEntriesForMeetup.mockReturnValue([{ title: '自作OSの話', speakerName: 'A' } as LtEntry]);

    const report = await registerVrcEvent(true);

    expect(mocks.ltEntriesForMeetup).toHaveBeenCalledWith('2026-11-06', true);
    const [isProd, input] = mocks.createMeetupEvent.mock.calls[0]!;
    expect(isProd).toBe(true);
    expect(input).toMatchObject({
      title: 'エンジニア集会【LTあり】自作OSの話',
      // 日本時間の 22:00〜23:30 を UTC で送る（オフセット付きの形は VRChat に弾かれる）
      startsAt: '2026-11-06T13:00:00.000Z',
      endsAt: '2026-11-06T14:30:00.000Z',
    });
    expect(input.description).toContain('「自作OSの話」 / A');
    expect(mocks.storage.vrcEvent).toEqual({ groupId: 'grp_prod', eventId: 'cal_1' });
    expect(report).toContain('登録しました');
  });

  // YES を押し直しても二重に作らない
  it('本番で作成済みなら作らない', async () => {
    mocks.storage.vrcEvent = { groupId: 'grp_prod', eventId: 'cal_1' };

    const report = await registerVrcEvent(true);

    expect(mocks.createMeetupEvent).not.toHaveBeenCalled();
    expect(report).toContain('登録済み');
  });

  it('テストではテスト用のグループに作り、控えは残さない', async () => {
    const report = await registerVrcEvent(false);

    expect(mocks.createMeetupEvent.mock.calls[0]![0]).toBe(false);
    expect(mocks.storage.vrcEvent).toBeNull();
    expect(report).toContain('テスト用のグループ');
  });

  it('作れなければ理由を返す', async () => {
    mocks.createMeetupEvent.mockRejectedValue(new Error('403 forbidden'));

    const report = await registerVrcEvent(true);

    expect(report).toContain('403 forbidden');
    expect(mocks.storage.vrcEvent).toBeNull();
  });
});

describe('deleteVrcEvent', () => {
  it('作ったイベントを消し、控えを消す', async () => {
    mocks.storage.vrcEvent = { groupId: 'grp_prod', eventId: 'cal_1' };

    const report = await deleteVrcEvent();

    expect(mocks.deleteMeetupEvent).toHaveBeenCalledWith({ groupId: 'grp_prod', eventId: 'cal_1' });
    expect(mocks.storage.vrcEvent).toBeNull();
    expect(report).toContain('削除しました');
  });

  it('消せなければ、手で消すよう案内して控えは残す', async () => {
    mocks.storage.vrcEvent = { groupId: 'grp_prod', eventId: 'cal_1' };
    mocks.deleteMeetupEvent.mockRejectedValue(new Error('timeout'));

    const report = await deleteVrcEvent();

    expect(report).toContain('手で削除');
    expect(mocks.storage.vrcEvent).not.toBeNull();
  });

  it('作っていなければ何もしない', async () => {
    expect(await deleteVrcEvent()).toBeNull();
    expect(mocks.deleteMeetupEvent).not.toHaveBeenCalled();
  });
});

describe('jstToIso', () => {
  it('日付をまたぐ時刻も UTC に直す', () => {
    expect(jstToIso('2026-11-06', '08:30')).toBe('2026-11-05T23:30:00.000Z');
  });
});
