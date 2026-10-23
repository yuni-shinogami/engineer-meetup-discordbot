import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ButtonInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  storage: {
    isScheduled: false,
    confirmAnswered: false,
    preAnnounceMissed: false,
    preAnnouncePostUrl: null as string | null,
  },
  triggerPreAnnounce: vi.fn(async () => {}),
  postSlidesToChannel: vi.fn(async () => {}),
}));

vi.mock('../../config', () => ({
  config: {
    operationsChannelId: 'ops-channel-id',
    testChannelId: 'test-channel-id',
    canvaAutoPostSlides: false,
  },
}));
vi.mock('../../../x/postAnnouncement', () => ({ postAnnouncement: vi.fn() }));
vi.mock('../../storage', () => ({ storage: mocks.storage }));
vi.mock('../../scheduler', () => ({ triggerPreAnnounce: mocks.triggerPreAnnounce }));
vi.mock('../../slides', () => ({ postSlidesToChannel: mocks.postSlidesToChannel }));
vi.mock('../utils', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => String(e),
}));

import { CONFIRM_MEETUP_NO, CONFIRM_MEETUP_YES } from '../../meetup';
import { handleConfirmMeetupButton, handleLatePreAnnounceButton } from '../confirm-meetup';

type Payload = { content: string; components?: unknown[] };

function buttonInteraction(customId: string, channelId = 'ops-channel-id') {
  return {
    customId,
    channelId,
    client: {},
    user: { id: 'user-1' },
    message: { content: '【確認】今週エンジニア集会やる？' },
    update: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ButtonInteraction & {
    update: ReturnType<typeof vi.fn>;
    editReply: ReturnType<typeof vi.fn>;
  };
}

function customIds(payload: Payload): string[] {
  return (payload.components ?? []).flatMap(row =>
    (row as { toJSON(): { components: { custom_id: string }[] } }).toJSON().components.map(c => c.custom_id));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.triggerPreAnnounce.mockReset();
  Object.assign(mocks.storage, {
    isScheduled: false,
    confirmAnswered: false,
    preAnnounceMissed: false,
    preAnnouncePostUrl: null,
  });
});

describe('handleConfirmMeetupButton', () => {
  it('19時前の YES は従来どおり自動投稿を案内し、ボタンを出さない', async () => {
    const interaction = buttonInteraction(CONFIRM_MEETUP_YES);

    await handleConfirmMeetupButton(interaction);

    const payload = interaction.update.mock.calls[0]![0] as Payload;
    expect(payload.content).toContain('木曜19時に事前告知を自動投稿します');
    expect(payload.components).toEqual([]);
    expect(mocks.storage.isScheduled).toBe(true);
    expect(mocks.storage.confirmAnswered).toBe(true);
  });

  it('事前告知の時刻を過ぎてからの YES には投稿ボタンを出す', async () => {
    mocks.storage.preAnnounceMissed = true;
    const interaction = buttonInteraction(CONFIRM_MEETUP_YES);

    await handleConfirmMeetupButton(interaction);

    const payload = interaction.update.mock.calls[0]![0] as Payload;
    expect(payload.content).toContain('事前告知の時刻を過ぎている');
    expect(customIds(payload)).toEqual(['meetup:late-pre-announce:prod']);
  });

  it('テストチャンネルで押された場合はテスト投稿のボタンにする', async () => {
    mocks.storage.preAnnounceMissed = true;
    const interaction = buttonInteraction(CONFIRM_MEETUP_YES, 'test-channel-id');

    await handleConfirmMeetupButton(interaction);

    expect(customIds(interaction.update.mock.calls[0]![0] as Payload))
      .toEqual(['meetup:late-pre-announce:test']);
  });

  it('既に事前告知を投稿済みならボタンを出さない', async () => {
    mocks.storage.preAnnounceMissed = true;
    mocks.storage.preAnnouncePostUrl = 'https://x.com/foo/status/1';
    const interaction = buttonInteraction(CONFIRM_MEETUP_YES);

    await handleConfirmMeetupButton(interaction);

    expect((interaction.update.mock.calls[0]![0] as Payload).components).toEqual([]);
  });

  it('時刻を過ぎていても NO ならボタンを出さない', async () => {
    mocks.storage.preAnnounceMissed = true;
    const interaction = buttonInteraction(CONFIRM_MEETUP_NO);

    await handleConfirmMeetupButton(interaction);

    const payload = interaction.update.mock.calls[0]![0] as Payload;
    expect(payload.content).toContain('今週の自動告知は行いません');
    expect(payload.components).toEqual([]);
    expect(mocks.storage.confirmAnswered).toBe(true);
  });
});

describe('handleLatePreAnnounceButton', () => {
  it('事前告知を投稿し、結果をメッセージに反映する', async () => {
    mocks.storage.isScheduled = true;
    mocks.triggerPreAnnounce.mockImplementation(async () => {
      mocks.storage.preAnnouncePostUrl = 'https://x.com/foo/status/1';
    });
    const interaction = buttonInteraction('meetup:late-pre-announce:prod');

    await handleLatePreAnnounceButton(interaction, ['prod']);

    expect(mocks.triggerPreAnnounce).toHaveBeenCalledWith(interaction.client, true);
    expect((interaction.update.mock.calls[0]![0] as Payload).components).toEqual([]);
    expect((interaction.editReply.mock.calls[0]![0] as Payload).content)
      .toContain('https://x.com/foo/status/1');
  });

  it('test 引数ならテストモードで投稿する', async () => {
    mocks.storage.isScheduled = true;
    const interaction = buttonInteraction('meetup:late-pre-announce:test');

    await handleLatePreAnnounceButton(interaction, ['test']);

    expect(mocks.triggerPreAnnounce).toHaveBeenCalledWith(interaction.client, false);
  });

  it('投稿に失敗したら手動での再実行を案内する', async () => {
    mocks.storage.isScheduled = true;
    const interaction = buttonInteraction('meetup:late-pre-announce:prod');

    await handleLatePreAnnounceButton(interaction, ['prod']);

    expect((interaction.editReply.mock.calls[0]![0] as Payload).content).toContain('/pre-announce');
  });

  // ボタンを押すまでの間に状況が変わっていたら投稿しない
  it('開催予定が取り消されていれば投稿しない', async () => {
    const interaction = buttonInteraction('meetup:late-pre-announce:prod');

    await handleLatePreAnnounceButton(interaction, ['prod']);

    expect(mocks.triggerPreAnnounce).not.toHaveBeenCalled();
    expect((interaction.update.mock.calls[0]![0] as Payload).content).toContain('取り消されている');
  });

  it('既に投稿済みなら二重投稿しない', async () => {
    mocks.storage.isScheduled = true;
    mocks.storage.preAnnouncePostUrl = 'https://x.com/foo/status/1';
    const interaction = buttonInteraction('meetup:late-pre-announce:prod');

    await handleLatePreAnnounceButton(interaction, ['prod']);

    expect(mocks.triggerPreAnnounce).not.toHaveBeenCalled();
    expect((interaction.update.mock.calls[0]![0] as Payload).content).toContain('投稿済み');
  });
});
