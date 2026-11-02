import { describe, it, expect, vi, beforeEach } from 'vitest';

const http = vi.hoisted(() => ({ post: vi.fn(), delete: vi.fn() }));

vi.mock('../session', () => ({
  withSession: async (fn: (session: unknown) => Promise<unknown>) =>
    fn({ client: { http }, user: { userId: 'usr_main', displayName: 'メイン' } }),
}));

import { createMeetupEvent, deleteMeetupEvent } from '../groupEvent';

const INPUT = {
  title: 'エンジニア集会',
  description: '説明',
  startsAt: '2026-11-06T22:00:00+09:00',
  endsAt: '2026-11-06T23:30:00+09:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROUP_ID = 'grp_prod';
  process.env.TEST_GROUP_ID = 'grp_test';
  http.post.mockResolvedValue({ status: 200, data: { id: 'cal_1' } });
  http.delete.mockResolvedValue({ status: 200, data: {} });
});

describe('createMeetupEvent', () => {
  it('本番は公開・Hangout・通知なしで、下書きにせずに作る', async () => {
    const ref = await createMeetupEvent(true, INPUT);

    const [path, body] = http.post.mock.calls[0]!;
    expect(path).toBe('/calendar/grp_prod/event');
    expect(body).toMatchObject({
      ...INPUT,
      category: 'hangout',
      accessType: 'public',
      sendCreationNotification: false,
      // 指定しないと下書きで作られて公開されない
      isDraft: false,
      platforms: ['standalonewindows', 'android'],
    });
    expect(ref).toEqual({ groupId: 'grp_prod', eventId: 'cal_1' });
  });

  it('テストはテスト用のグループに、グループ内だけで作る', async () => {
    await createMeetupEvent(false, INPUT);

    const [path, body] = http.post.mock.calls[0]!;
    expect(path).toBe('/calendar/grp_test/event');
    expect(body.accessType).toBe('group');
  });

  it('作れなければ VRChat の返事を添えて失敗する', async () => {
    http.post.mockResolvedValue({ status: 403, data: { error: { message: 'missing permission' } } });

    await expect(createMeetupEvent(true, INPUT)).rejects.toThrow(/403.*missing permission/);
  });
});

describe('deleteMeetupEvent', () => {
  it('作ったグループのイベントを消す', async () => {
    await deleteMeetupEvent({ groupId: 'grp_prod', eventId: 'cal_1' });

    expect(http.delete).toHaveBeenCalledWith('/calendar/grp_prod/cal_1');
  });

  it('すでに消えていても失敗にしない', async () => {
    http.delete.mockResolvedValue({ status: 404, data: {} });

    await expect(deleteMeetupEvent({ groupId: 'grp_prod', eventId: 'cal_1' })).resolves.toBeUndefined();
  });
});
