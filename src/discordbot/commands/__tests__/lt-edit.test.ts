import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModalSubmitInteraction } from 'discord.js';
import type { LtEntry } from '../../lt/types';

vi.mock('../../config', () => ({
  config: { operatorRoleId: 'op-role', ltSlotsPerDay: 1, ltDateCandidates: 8, meetupWeekday: 5 },
  ltForumChannelId: () => '',
}));

vi.mock('../../lt/forum', () => ({
  applyLtEntryToPost: vi.fn().mockResolvedValue(undefined),
  fetchLtThread: vi.fn().mockResolvedValue({ id: 't1', send: vi.fn() }),
}));

vi.mock('../../lt/store', () => ({
  ltStore: {
    get: vi.fn(),
    update: vi.fn(),
    slotUsageByDate: vi.fn(() => new Map<string, number>()),
  },
}));

import { ltStore } from '../../lt/store';
import { handleLtEditModal } from '../lt-edit';

const entry = (patch: Partial<LtEntry> = {}): LtEntry => ({
  id: 't1',
  speakerId: 'speaker',
  speakerName: 'ゆに',
  title: '未定',
  xAccount: null,
  durationMin: 10,
  videoPlayback: true,
  capturePolicy: 'allowed',
  archivePolicy: 'public',
  status: 'applied',
  preferredDates: [],
  scheduleNote: '',
  eventDate: null,
  materials: { speakerIconPath: null, titleSlidePath: null, announceImagePath: null },
  announce: {
    x: { ref: null, postedAt: null },
    discord: { ref: null, postedAt: null },
    vrchat: { ref: null, postedAt: null },
  },
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  ...patch,
});

function modalInteraction(fields: Record<string, string>, userId = 'speaker') {
  return {
    user: { id: userId },
    member: { roles: [] },
    client: {},
    fields: { getTextInputValue: (id: string) => fields[id] ?? '' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ModalSubmitInteraction & {
    editReply: ReturnType<typeof vi.fn>;
    reply: ReturnType<typeof vi.fn>;
  };
}

describe('handleLtEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ltStore.get).mockReturnValue(entry());
    vi.mocked(ltStore.update).mockImplementation((id, patch) => ({ ...entry({ id }), ...patch }));
  });

  it('タイトルと X アカウントを保存する', async () => {
    const interaction = modalInteraction({ title: '型で殴る話', xAccount: '@example' });
    await handleLtEditModal(interaction, ['t1']);

    expect(ltStore.update).toHaveBeenCalledWith('t1', { title: '型で殴る話', xAccount: 'example' });
    expect(interaction.editReply.mock.calls[0]![0]).toContain('型で殴る話');
  });

  it('X アカウントが空欄なら未登録として保存する（エラーにしない）', async () => {
    await handleLtEditModal(modalInteraction({ title: '型で殴る話', xAccount: '  ' }), ['t1']);

    expect(ltStore.update).toHaveBeenCalledWith('t1', { title: '型で殴る話', xAccount: null });
  });

  it('X アカウントが読み取れない場合は保存しない', async () => {
    const interaction = modalInteraction({ title: '型で殴る話', xAccount: 'ゆに' });
    await handleLtEditModal(interaction, ['t1']);

    expect(ltStore.update).not.toHaveBeenCalled();
    expect(interaction.editReply.mock.calls[0]![0]).toContain('読み取れませんでした');
  });

  it('タイトルが未定のままなら残りの宿題として返す', async () => {
    const interaction = modalInteraction({ title: '未定', xAccount: '@example' });
    await handleLtEditModal(interaction, ['t1']);

    const message = interaction.editReply.mock.calls[0]![0] as string;
    expect(message).toContain('未定のまま');
    expect(message).toContain('LT のタイトル');
  });

  it('本人でも運営でもなければ編集できない', async () => {
    const interaction = modalInteraction({ title: 'x', xAccount: '' }, 'someone-else');
    await handleLtEditModal(interaction, ['t1']);

    expect(ltStore.update).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('応募者本人') }),
    );
  });

  it('運営は代理で入力できる', async () => {
    const interaction = modalInteraction({ title: '代理入力', xAccount: '' }, 'operator');
    (interaction as unknown as { member: { roles: string[] } }).member = { roles: ['op-role'] };
    await handleLtEditModal(interaction, ['t1']);

    expect(ltStore.update).toHaveBeenCalledWith('t1', { title: '代理入力', xAccount: null });
  });
});
