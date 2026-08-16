import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import type { LtEntry } from '../../lt/types';

vi.mock('../../config', () => ({
  config: {
    operatorRoleId: 'op-role',
    ltSlotsPerDay: 1,
    ltDateCandidates: 8,
    meetupWeekday: 5,
    ltStorePath: './lt-store.test.json',
  },
  ltForumChannelId: () => '',
}));

// vi.mock はファイル先頭へ巻き上げられるため、参照する変数も同じく巻き上げる
const { threadSend } = vi.hoisted(() => ({ threadSend: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../../lt/forum', () => ({
  applyLtEntryToPost: vi.fn().mockResolvedValue(undefined),
  fetchLtThread: vi.fn().mockResolvedValue({ id: 't1', send: threadSend }),
}));

vi.mock('../../lt/store', () => ({
  ltStore: {
    get: vi.fn(),
    update: vi.fn(),
    entriesOnDate: vi.fn(() => [] as LtEntry[]),
    slotUsageByDate: vi.fn(() => new Map<string, number>()),
  },
}));

import { ltStore } from '../../lt/store';
import {
  handleLtScheduleButton,
  handleLtScheduleSelect,
  LT_MANUAL_DATE_VALUE,
  normalizeDateInput,
  scheduleDateChoices,
  scheduleWarnings,
} from '../lt-schedule';

const entry = (patch: Partial<LtEntry> = {}): LtEntry => ({
  id: 't1',
  speakerId: 'speaker',
  speakerName: 'ゆに',
  title: 'LTのタイトル',
  xAccount: 'yuni',
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

describe('normalizeDateInput', () => {
  it('YYYY-MM-DD をそのまま受ける', () => {
    expect(normalizeDateInput('2026-09-04')).toBe('2026-09-04');
    expect(normalizeDateInput(' 2026-09-04 ')).toBe('2026-09-04');
  });

  it('区切り違い・ゼロ無し・全角も受け付ける', () => {
    expect(normalizeDateInput('2026/9/4')).toBe('2026-09-04');
    expect(normalizeDateInput('2026年9月4日')).toBe('2026-09-04');
    expect(normalizeDateInput('２０２６－０９－０４'.replace(/－/g, '-'))).toBe('2026-09-04');
  });

  it('存在しない日付・不正な形式は null', () => {
    expect(normalizeDateInput('2026-02-31')).toBeNull();
    expect(normalizeDateInput('9月4日')).toBeNull();
    expect(normalizeDateInput('')).toBeNull();
  });
});

describe('scheduleWarnings', () => {
  const now = new Date(2026, 7, 11); // 2026-08-11 (火)

  it('開催曜日の未来日なら警告なし', () => {
    expect(scheduleWarnings('2026-08-14', now)).toEqual([]);
  });

  it('開催曜日でなければ警告する', () => {
    expect(scheduleWarnings('2026-08-13', now).join()).toContain('開催曜日ではありません');
  });

  it('過去の日付なら警告する', () => {
    expect(scheduleWarnings('2026-08-07', now).join()).toContain('過去の日付');
  });
});

describe('scheduleDateChoices', () => {
  const now = new Date(2026, 7, 11);

  it('登壇者の希望日を先頭に並べる', () => {
    const choices = scheduleDateChoices({ preferredDates: ['2026-09-04'], eventDate: null }, now);
    expect(choices[0]).toBe('2026-09-04');
    expect(choices).toContain('2026-08-14');
  });

  it('希望日を候補側で重複させない', () => {
    const choices = scheduleDateChoices({ preferredDates: ['2026-08-14'], eventDate: null }, now);
    expect(choices.filter(d => d === '2026-08-14')).toHaveLength(1);
  });

  it('候補期間の外で確定していてもその日を含める', () => {
    // 相談を経て候補外の日に決まったあと、選択画面から現在の確定日が消えないこと
    const choices = scheduleDateChoices({ preferredDates: [], eventDate: '2027-03-05' }, now);
    expect(choices).toContain('2027-03-05');
  });

  it('セレクトの上限を超えない（手入力の1枠を残す）', () => {
    const preferred = Array.from({ length: 40 }, (_, i) => `2026-${String(i % 12 + 1).padStart(2, '0')}-01`);
    expect(scheduleDateChoices({ preferredDates: preferred, eventDate: null }, now).length)
      .toBeLessThanOrEqual(24);
  });
});

function selectInteraction(values: string[], member: unknown = { roles: ['op-role'] }) {
  return {
    values,
    user: { id: 'operator' },
    member,
    client: {},
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  } as unknown as StringSelectMenuInteraction & {
    reply: ReturnType<typeof vi.fn>;
    editReply: ReturnType<typeof vi.fn>;
    showModal: ReturnType<typeof vi.fn>;
  };
}

describe('日程の確定', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ltStore.get).mockReturnValue(entry());
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([]);
    vi.mocked(ltStore.update).mockImplementation((id, patch) => ({ ...entry({ id }), ...patch }));
  });

  it('運営ロールが無ければ確定できない', async () => {
    const interaction = selectInteraction(['2026-09-04'], { roles: [] });
    await handleLtScheduleSelect(interaction, ['t1']);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('運営のみ') }),
    );
    expect(ltStore.update).not.toHaveBeenCalled();
  });

  it('レコードが無ければ確定できない', async () => {
    vi.mocked(ltStore.get).mockReturnValue(undefined);
    const interaction = selectInteraction(['2026-09-04']);
    await handleLtScheduleSelect(interaction, ['t1']);

    expect(ltStore.update).not.toHaveBeenCalled();
  });

  it('確定するとレコードとステータスが更新され、ポストで登壇者に通知される', async () => {
    const interaction = selectInteraction(['2026-09-04']);
    await handleLtScheduleSelect(interaction, ['t1']);

    expect(ltStore.update).toHaveBeenCalledWith('t1', {
      eventDate: '2026-09-04',
      status: 'scheduled',
    });
    expect(threadSend).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('9月4日(金)'),
        allowedMentions: { users: ['speaker'] },
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('確定しました') }),
    );
  });

  it('素材集めまで進んでいるレコードのステータスは巻き戻さない', async () => {
    vi.mocked(ltStore.get).mockReturnValue(entry({ status: 'ready', eventDate: '2026-08-14' }));
    await handleLtScheduleSelect(selectInteraction(['2026-09-04']), ['t1']);

    expect(ltStore.update).toHaveBeenCalledWith('t1', {
      eventDate: '2026-09-04',
      status: 'ready',
    });
  });

  it('枠が埋まっている日には確定できない', async () => {
    // セレクトは作られた時点の空き状況を持つため、押した時点で必ず取り直す
    vi.mocked(ltStore.entriesOnDate).mockReturnValue([entry({ id: 'other', speakerName: '別の人' })]);
    const interaction = selectInteraction(['2026-09-04']);
    await handleLtScheduleSelect(interaction, ['t1']);

    expect(ltStore.update).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('別の人') }),
    );
  });

  it('「その他の日付」を選ぶと手入力のモーダルを開く', async () => {
    const interaction = selectInteraction([LT_MANUAL_DATE_VALUE]);
    await handleLtScheduleSelect(interaction, ['t1']);

    expect(interaction.showModal).toHaveBeenCalled();
    expect(ltStore.update).not.toHaveBeenCalled();
  });
});

describe('確定ボタン', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ltStore.get).mockReturnValue(entry({
      preferredDates: ['2026-08-14'],
      scheduleNote: '9月以降が助かります',
    }));
  });

  it('運営に希望日と相談内容を添えて候補を出す', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      user: { id: 'operator' },
      member: { roles: ['op-role'] },
      reply,
    } as unknown as ButtonInteraction;

    await handleLtScheduleButton(interaction, ['t1']);

    const payload = reply.mock.calls[0]![0];
    expect(payload.content).toContain('8月14日(金)');
    expect(payload.content).toContain('9月以降が助かります');
    expect(payload.ephemeral).toBe(true);
    expect(payload.components).toHaveLength(1);
  });
});
