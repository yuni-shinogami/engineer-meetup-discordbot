import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  registerDiscordEvent: vi.fn(),
  deleteDiscordEvent: vi.fn(),
}));

vi.mock('../../discord-event', () => ({
  registerDiscordEvent: mocks.registerDiscordEvent,
  deleteDiscordEvent: mocks.deleteDiscordEvent,
}));
vi.mock('../utils', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ エラーが発生しました: ${e instanceof Error ? e.message : String(e)}`,
}));

import { handleDiscordEventCommand } from '../discord-event';

function command(options: { action?: string; production?: boolean } = {}) {
  return {
    client: { id: 'client' },
    options: {
      getString: (name: string) => (name === 'action' ? options.action ?? null : null),
      getBoolean: (name: string) => (name === 'production' ? options.production ?? null : null),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & Record<'deferReply' | 'editReply', ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registerDiscordEvent.mockResolvedValue({ content: '🧪 作っていません', files: ['image'] });
  mocks.deleteDiscordEvent.mockResolvedValue(null);
});

describe('/discord-event', () => {
  it('既定はテストで、内容と画像を返す', async () => {
    const i = command();

    await handleDiscordEventCommand(i);

    expect(mocks.registerDiscordEvent).toHaveBeenCalledWith(i.client, false);
    expect(i.editReply).toHaveBeenCalledWith({ content: '🧪 作っていません', files: ['image'] });
  });

  it('production:True で本番に作る', async () => {
    const i = command({ production: true });

    await handleDiscordEventCommand(i);

    expect(mocks.registerDiscordEvent).toHaveBeenCalledWith(i.client, true);
  });

  it('本番の削除は作ったイベントを消し、なければその旨を返す', async () => {
    const i = command({ action: 'delete', production: true });

    await handleDiscordEventCommand(i);

    expect(mocks.deleteDiscordEvent).toHaveBeenCalledWith(i.client);
    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('作っていません'));
  });
});
