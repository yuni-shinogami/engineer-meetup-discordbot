import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  registerVrcEvent: vi.fn(),
  deleteVrcEvent: vi.fn(),
}));

vi.mock('../../vrc-event', () => ({
  registerVrcEvent: mocks.registerVrcEvent,
  deleteVrcEvent: mocks.deleteVrcEvent,
}));
vi.mock('../../../../shared/interaction', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ エラーが発生しました: ${e instanceof Error ? e.message : String(e)}`,
}));

import { handleVrcEventCommand } from '../vrc-event';

function command(options: { action?: string; production?: boolean } = {}) {
  return {
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
  mocks.registerVrcEvent.mockResolvedValue('🧪 テスト用のグループにイベントを作りました');
  mocks.deleteVrcEvent.mockResolvedValue(null);
});

describe('/vrc-event', () => {
  it('既定はテストの登録', async () => {
    const i = command();

    await handleVrcEventCommand(i);

    expect(mocks.registerVrcEvent).toHaveBeenCalledWith(false);
    expect(i.editReply).toHaveBeenCalledWith('🧪 テスト用のグループにイベントを作りました');
  });

  it('production:True で本番に登録する', async () => {
    await handleVrcEventCommand(command({ production: true }));

    expect(mocks.registerVrcEvent).toHaveBeenCalledWith(true);
  });

  it('本番の削除は作ったイベントを消し、なければその旨を返す', async () => {
    const i = command({ action: 'delete', production: true });

    await handleVrcEventCommand(i);

    expect(mocks.deleteVrcEvent).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('作っていません'));
  });

  it('テストの削除は控えがないので、手で消すよう案内する', async () => {
    const i = command({ action: 'delete' });

    await handleVrcEventCommand(i);

    expect(mocks.deleteVrcEvent).not.toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('手で削除'));
  });
});
