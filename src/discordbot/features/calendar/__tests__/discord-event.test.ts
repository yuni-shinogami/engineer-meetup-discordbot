import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';

const mocks = vi.hoisted(() => ({
  storage: { discordEventId: null as string | null },
  ltEntriesForMeetup: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../../storage', () => ({ storage: mocks.storage }));
vi.mock('../../../config', () => ({ config: { guildId: 'guild-1', vrceveSshTarget: '', vrceveSshKey: '' } }));
vi.mock('../../lt/weekly-announce', () => ({
  nextMeetupDate: () => '2026-11-06',
  ltEntriesForMeetup: mocks.ltEntriesForMeetup,
}));
vi.mock('../../../../vrchat/groupEvent', () => ({ createMeetupEvent: vi.fn(), deleteMeetupEvent: vi.fn() }));

import { deleteDiscordEvent, discordEventFields, registerDiscordEvent } from '../discord-event';
import type { LtEntry } from '../../lt/types';

const client = {
  guilds: { fetch: vi.fn(async () => ({ scheduledEvents: { create: mocks.create, delete: mocks.remove } })) },
} as unknown as Client;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.discordEventId = null;
  mocks.ltEntriesForMeetup.mockReturnValue([]);
  mocks.create.mockResolvedValue({ id: 'ev_1', url: 'https://discord.com/events/guild-1/ev_1' });
  mocks.remove.mockResolvedValue(undefined);
});

describe('discordEventFields', () => {
  it('22:00 から翌 3:00（日本時間）で、以前の毎週のイベントと同じ説明にする', () => {
    const fields = discordEventFields('2026-11-06', []);

    expect(fields.name).toBe('エンジニア集会');
    expect(fields.startsAt).toBe('2026-11-06T13:00:00.000Z');
    expect(fields.endsAt).toBe('2026-11-06T18:00:00.000Z');
    expect(fields.description).toContain('22:00 インスタンスオープン');
    expect(fields.description).not.toContain('今週の LT');
  });

  it('LT がある週は名前と説明に LT を足す', () => {
    const fields = discordEventFields('2026-11-06', [{ title: '自作OSの話', speakerName: 'A' } as LtEntry]);

    expect(fields.name).toBe('エンジニア集会【LTあり】自作OSの話');
    expect(fields.description).toContain('【今週の LT】\n・「自作OSの話」 / A');
  });
});

describe('registerDiscordEvent', () => {
  it('本番では外部の場所「VRChat」で画像付きのイベントを作り、ID を控える', async () => {
    const report = await registerDiscordEvent(client, true);

    const options = mocks.create.mock.calls[0]![0];
    expect(options).toMatchObject({
      name: 'エンジニア集会',
      scheduledStartTime: '2026-11-06T13:00:00.000Z',
      scheduledEndTime: '2026-11-06T18:00:00.000Z',
      entityMetadata: { location: 'VRChat' },
    });
    expect(Buffer.isBuffer(options.image)).toBe(true);
    expect(mocks.storage.discordEventId).toBe('ev_1');
    expect(report.content).toContain('https://discord.com/events/guild-1/ev_1');
  });

  // Discord のイベントはサーバーの全員に見えるので、テストでは作らない
  it('テストでは作らずに、内容と画像を返す', async () => {
    const report = await registerDiscordEvent(client, false);

    expect(mocks.create).not.toHaveBeenCalled();
    expect(report.content).toContain('作っていません');
    expect(report.files).toHaveLength(1);
  });

  it('作成済みなら作らない', async () => {
    mocks.storage.discordEventId = 'ev_1';

    const report = await registerDiscordEvent(client, true);

    expect(mocks.create).not.toHaveBeenCalled();
    expect(report.content).toContain('作成済み');
  });

  it('権限がなければ、必要な権限を添えて返す', async () => {
    mocks.create.mockRejectedValue(new Error('Missing Permissions'));

    const report = await registerDiscordEvent(client, true);

    expect(report.content).toContain('イベントの作成');
    expect(mocks.storage.discordEventId).toBeNull();
  });
});

describe('deleteDiscordEvent', () => {
  it('作ったイベントを消し、控えを消す', async () => {
    mocks.storage.discordEventId = 'ev_1';

    const report = await deleteDiscordEvent(client);

    expect(mocks.remove).toHaveBeenCalledWith('ev_1');
    expect(mocks.storage.discordEventId).toBeNull();
    expect(report).toContain('削除しました');
  });

  it('作っていなければ何もしない', async () => {
    expect(await deleteDiscordEvent(client)).toBeNull();
  });
});
