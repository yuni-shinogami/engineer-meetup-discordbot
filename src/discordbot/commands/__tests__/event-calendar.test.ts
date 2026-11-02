import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  configured: true,
  registerOnVrceve: vi.fn(),
  deleteFromVrceve: vi.fn(),
  callVrceve: vi.fn(),
}));

vi.mock('../../vrceve', () => ({
  isVrceveConfigured: () => mocks.configured,
  registerOnVrceve: mocks.registerOnVrceve,
  deleteFromVrceve: mocks.deleteFromVrceve,
  callVrceve: mocks.callVrceve,
}));
vi.mock('../utils', () => ({
  requireOperatorRole: vi.fn().mockResolvedValue(true),
  formatError: (e: unknown) => `❌ エラーが発生しました: ${e instanceof Error ? e.message : String(e)}`,
}));

import { handleEventCalendarCommand } from '../event-calendar';

function command(options: { action?: string; production?: boolean } = {}) {
  return {
    options: {
      getString: (name: string) => (name === 'action' ? options.action ?? null : null),
      getBoolean: (name: string) => (name === 'production' ? options.production ?? null : null),
    },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & Record<'reply' | 'deferReply' | 'editReply', ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
});

describe('/event-calendar', () => {
  it('既定はテストの登録で、入力した画面を返す', async () => {
    mocks.registerOnVrceve.mockResolvedValue({ content: '🧪 送信していません', files: ['image'] });
    const i = command();

    await handleEventCalendarCommand(i);

    expect(mocks.registerOnVrceve).toHaveBeenCalledWith(false);
    expect(i.editReply).toHaveBeenCalledWith({ content: '🧪 送信していません', files: ['image'] });
  });

  it('production:True で本番に登録する', async () => {
    mocks.registerOnVrceve.mockResolvedValue({ content: '📅 登録しました' });

    await handleEventCalendarCommand(command({ production: true }));

    expect(mocks.registerOnVrceve).toHaveBeenCalledWith(true);
  });

  it('削除は本番だけで、登録していなければその旨を返す', async () => {
    mocks.deleteFromVrceve.mockResolvedValue(null);
    const prod = command({ action: 'delete', production: true });
    await handleEventCalendarCommand(prod);
    expect(prod.editReply).toHaveBeenCalledWith(expect.stringContaining('登録していません'));

    const test = command({ action: 'delete' });
    await handleEventCalendarCommand(test);
    expect(mocks.deleteFromVrceve).toHaveBeenCalledTimes(1);
    expect(test.editReply).toHaveBeenCalledWith(expect.stringContaining('テストでは登録していない'));
  });

  it('ログインの確認では、ログインしているアカウントを返す', async () => {
    mocks.callVrceve.mockResolvedValue({ account: 'meetup@example.com' });
    const i = command({ action: 'check' });

    await handleEventCalendarCommand(i);

    expect(mocks.callVrceve).toHaveBeenCalledWith('check');
    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('meetup@example.com'));
  });

  it('VM でログインが切れていれば理由を返す', async () => {
    mocks.callVrceve.mockRejectedValue(new Error('Google にログインしていません'));
    const i = command({ action: 'check' });

    await handleEventCalendarCommand(i);

    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('ログインしていません'));
  });

  it('設定されていなければ動かさない', async () => {
    mocks.configured = false;
    const i = command();

    await handleEventCalendarCommand(i);

    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(mocks.registerOnVrceve).not.toHaveBeenCalled();
  });
});
