import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  executePreAnnounce: vi.fn(async () => 'https://x.com/foo/status/1'),
  runWeeklyLtAnnounce: vi.fn(async (): Promise<string | null> => null),
}));

vi.mock('../../meetup', () => ({ executePreAnnounce: mocks.executePreAnnounce }));
vi.mock('../../lt/weekly-announce', () => ({
  runWeeklyLtAnnounce: mocks.runWeeklyLtAnnounce,
  nextMeetupDate: () => '2026-08-21',
}));
vi.mock('../utils', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ エラーが発生しました: ${(e as Error).message}`,
}));

import { PRE_ANNOUNCE_TARGETS } from '../../lt/announce';
import { handlePreAnnounceCommand } from '../pre-announce';

function interactionWith(options: Record<string, boolean>) {
  return {
    client: {},
    options: { getBoolean: (name: string) => options[name] ?? null },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & { editReply: ReturnType<typeof vi.fn> };
}

/** 最後に返した本文（途中経過を除いた最終結果）。 */
function finalReply(interaction: { editReply: ReturnType<typeof vi.fn> }): string {
  const calls = interaction.editReply.mock.calls;
  return calls[calls.length - 1]![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.executePreAnnounce.mockResolvedValue('https://x.com/foo/status/1');
  mocks.runWeeklyLtAnnounce.mockResolvedValue(null);
});

describe('handlePreAnnounceCommand', () => {
  it('既定では事前告知とLT告知の両方を実行する', async () => {
    mocks.runWeeklyLtAnnounce.mockResolvedValue('📣 LT 告知\n✅ X: tweet-1');
    const interaction = interactionWith({});

    await handlePreAnnounceCommand(interaction);

    expect(mocks.executePreAnnounce).toHaveBeenCalledWith(false);
    expect(mocks.runWeeklyLtAnnounce).toHaveBeenCalledWith(interaction.client, false, { force: false, targets: PRE_ANNOUNCE_TARGETS });
    expect(finalReply(interaction)).toContain('事前告知を投稿しました');
    expect(finalReply(interaction)).toContain('✅ X: tweet-1');
  });

  // LT 告知だけ試したいときに、テストアカウントへ事前告知を撒かないための逃げ道
  it('lt-only では事前告知ツイートを投稿しない', async () => {
    mocks.runWeeklyLtAnnounce.mockResolvedValue('📣 LT 告知\n✅ X: tweet-1');
    const interaction = interactionWith({ 'lt-only': true });

    await handlePreAnnounceCommand(interaction);

    expect(mocks.executePreAnnounce).not.toHaveBeenCalled();
    expect(mocks.runWeeklyLtAnnounce).toHaveBeenCalledWith(interaction.client, false, { force: true, targets: PRE_ANNOUNCE_TARGETS });
    expect(finalReply(interaction)).not.toContain('事前告知を投稿しました');
  });

  // 無風のときこそ「どの日を見に行ったか」が分からないと原因を切り分けられない
  it('lt-only で対象が無ければ、確認した開催日を添えて必ず返す', async () => {
    const interaction = interactionWith({ 'lt-only': true });

    await handlePreAnnounceCommand(interaction);

    expect(finalReply(interaction)).toContain('確定している LT はありません');
    expect(finalReply(interaction)).toMatch(/\d+月\d+日\(.\)/);
  });

  it('skip-lt では LT 告知を実行しない', async () => {
    const interaction = interactionWith({ 'skip-lt': true });

    await handlePreAnnounceCommand(interaction);

    expect(mocks.executePreAnnounce).toHaveBeenCalled();
    expect(mocks.runWeeklyLtAnnounce).not.toHaveBeenCalled();
  });

  it('lt-only と skip-lt の同時指定は何も投稿せずに弾く', async () => {
    const interaction = interactionWith({ 'lt-only': true, 'skip-lt': true });

    await handlePreAnnounceCommand(interaction);

    expect(mocks.executePreAnnounce).not.toHaveBeenCalled();
    expect(mocks.runWeeklyLtAnnounce).not.toHaveBeenCalled();
    expect(finalReply(interaction)).toContain('同時に指定できません');
  });

  it('production: true なら本番モードで両方に伝える', async () => {
    const interaction = interactionWith({ production: true });

    await handlePreAnnounceCommand(interaction);

    expect(mocks.executePreAnnounce).toHaveBeenCalledWith(true);
    expect(mocks.runWeeklyLtAnnounce).toHaveBeenCalledWith(interaction.client, true, { force: false, targets: PRE_ANNOUNCE_TARGETS });
  });

  // 別々の投稿なので、事前告知が失敗しても LT 告知は続ける
  it('事前告知が失敗してもLT告知は実行し、両方の結果を返す', async () => {
    mocks.executePreAnnounce.mockRejectedValue(new Error('X API error'));
    mocks.runWeeklyLtAnnounce.mockResolvedValue('📣 LT 告知\n✅ X: tweet-1');
    const interaction = interactionWith({});

    await handlePreAnnounceCommand(interaction);

    expect(mocks.runWeeklyLtAnnounce).toHaveBeenCalled();
    expect(finalReply(interaction)).toContain('X API error');
    expect(finalReply(interaction)).toContain('✅ X: tweet-1');
  });
});
