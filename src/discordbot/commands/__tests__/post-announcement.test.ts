import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  postQuoteAnnouncement: vi.fn(async () => 'quote-1'),
  postGroupAnnouncement: vi.fn(async () => undefined),
  channelSend: vi.fn(async (_content: string) => undefined),
  runWeeklyLtAnnounce: vi.fn(async (): Promise<string | null> => null),
  storage: {
    lastInviteUrl: 'https://vrch.at/invite' as string | null,
    lastTweetId: 'tweet-1' as string | null,
    preAnnouncePostUrl: 'https://x.com/foo/status/1' as string | null,
    isScheduled: true,
  },
}));

vi.mock('../../config', () => ({
  config: {
    publicChannelId: 'public-ch',
    testChannelId: 'test-ch',
    announceRoleId: 'announce-role',
    vrcStateDir: '/state',
  },
}));
vi.mock('../../storage', () => ({ storage: mocks.storage }));
vi.mock('../../../x/quotePost', () => ({ postQuoteAnnouncement: mocks.postQuoteAnnouncement }));
vi.mock('../../../x/postUrl', () => ({ xPostUrl: (id: string) => `https://x.com/acc/status/${id}` }));
vi.mock('../../../vrchat/postGroupAnnouncement', () => ({
  postGroupAnnouncement: mocks.postGroupAnnouncement,
  AuthError: class AuthError extends Error {},
}));
vi.mock('../../lt/weekly-announce', () => ({
  runWeeklyLtAnnounce: mocks.runWeeklyLtAnnounce,
  nextMeetupDate: () => '2026-08-21',
}));
vi.mock('../utils', () => ({ requireOperatorRole: vi.fn().mockResolvedValue(true) }));

import { MEETUP_DAY_TARGETS } from '../../lt/announce';
import { handlePostAnnouncementCommand } from '../post-announcement';

function interactionWith(options: Record<string, boolean>) {
  return {
    client: { channels: { fetch: vi.fn(async () => ({ send: mocks.channelSend })) } },
    options: { getBoolean: (name: string) => options[name] ?? null },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & { editReply: ReturnType<typeof vi.fn> };
}

function finalReply(interaction: { editReply: ReturnType<typeof vi.fn> }): string {
  const calls = interaction.editReply.mock.calls;
  return calls[calls.length - 1]![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runWeeklyLtAnnounce.mockResolvedValue(null);
  mocks.storage.lastInviteUrl = 'https://vrch.at/invite';
  mocks.storage.lastTweetId = 'tweet-1';
  mocks.storage.isScheduled = true;
});

describe('handlePostAnnouncementCommand', () => {
  it('開催告知に続けて当日の LT 告知も投稿する', async () => {
    mocks.runWeeklyLtAnnounce.mockResolvedValue('📣 LT 告知\n✅ Discord: url');
    const interaction = interactionWith({});

    await handlePostAnnouncementCommand(interaction);

    expect(mocks.postQuoteAnnouncement).toHaveBeenCalled();
    expect(mocks.runWeeklyLtAnnounce).toHaveBeenCalledWith(
      interaction.client, false, { targets: MEETUP_DAY_TARGETS },
    );
    expect(finalReply(interaction)).toContain('✅ Discord: url');
  });

  // LT 告知はインスタンスに依存しないので、動作確認のために立てる必要はない
  it('lt-only は招待 URL が無くても LT 告知だけ実行する', async () => {
    mocks.storage.lastInviteUrl = null;
    mocks.runWeeklyLtAnnounce.mockResolvedValue('📣 LT 告知\n✅ VRChatグループ: vrc-1');
    const interaction = interactionWith({ 'lt-only': true });

    await handlePostAnnouncementCommand(interaction);

    expect(mocks.postQuoteAnnouncement).not.toHaveBeenCalled();
    expect(mocks.postGroupAnnouncement).not.toHaveBeenCalled();
    expect(mocks.channelSend).not.toHaveBeenCalled();
    expect(mocks.runWeeklyLtAnnounce).toHaveBeenCalledWith(
      interaction.client, false, { force: true, targets: MEETUP_DAY_TARGETS },
    );
    expect(finalReply(interaction)).toContain('✅ VRChatグループ: vrc-1');
  });

  it('lt-only で対象が無ければ、確認した開催日を添えて返す', async () => {
    const interaction = interactionWith({ 'lt-only': true });

    await handlePostAnnouncementCommand(interaction);

    expect(finalReply(interaction)).toContain('確定している LT はありません');
    expect(finalReply(interaction)).toMatch(/\d+月\d+日\(.\)/);
  });

  it('lt-only では週次の状態をリセットしない', async () => {
    const interaction = interactionWith({ 'lt-only': true });

    await handlePostAnnouncementCommand(interaction);

    expect(mocks.storage.isScheduled).toBe(true);
  });

  it('skip-lt では LT 告知を実行しない', async () => {
    const interaction = interactionWith({ 'skip-lt': true });

    await handlePostAnnouncementCommand(interaction);

    expect(mocks.postQuoteAnnouncement).toHaveBeenCalled();
    expect(mocks.runWeeklyLtAnnounce).not.toHaveBeenCalled();
  });

  it('lt-only と skip-lt の同時指定は何も投稿せずに弾く', async () => {
    const interaction = interactionWith({ 'lt-only': true, 'skip-lt': true });

    await handlePostAnnouncementCommand(interaction);

    expect(mocks.runWeeklyLtAnnounce).not.toHaveBeenCalled();
    expect(mocks.postQuoteAnnouncement).not.toHaveBeenCalled();
    expect(finalReply(interaction)).toContain('同時に指定できません');
  });

  it('lt-only 以外は従来どおり招待 URL を要求する', async () => {
    mocks.storage.lastInviteUrl = null;
    const interaction = interactionWith({});

    await handlePostAnnouncementCommand(interaction);

    expect(mocks.runWeeklyLtAnnounce).not.toHaveBeenCalled();
    expect(finalReply(interaction)).toContain('/create-instance');
  });
});
