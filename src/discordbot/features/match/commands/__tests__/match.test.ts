import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ButtonInteraction } from 'discord.js';

const mocks = vi.hoisted(() => ({
  store: {
    getPending: vi.fn(),
    getOptin: vi.fn(),
    confirm: vi.fn(),
    checkIn: vi.fn(),
    optins: vi.fn(),
    profiles: vi.fn(),
  },
  getUserProfile: vi.fn(),
}));

vi.mock('../../match-store', () => ({ matchStore: mocks.store }));
vi.mock('../../../../../vrchat/api/user', () => ({ getUser: vi.fn(), getUserProfile: mocks.getUserProfile }));
vi.mock('../../../../../vrchat/session', () => ({
  withSession: (fn: (s: { client: unknown }) => unknown) => fn({ client: {} }),
}));
vi.mock('../../../../storage', () => ({ storage: { isScheduled: true } }));
import { handleTonightButton, handleVerifyButton } from '../match';

function interaction() {
  return {
    user: { id: 'me' },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ButtonInteraction & Record<'reply' | 'deferReply' | 'editReply', ReturnType<typeof vi.fn>>;
}

const pending = { vrcUserId: 'usr_me', displayName: 'わたし', code: 'EM-ABC234', expiresAt: '2999-01-01T00:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('本人確認のボタン', () => {
  it('ステータスにコードがあれば申し込みにする', async () => {
    mocks.store.getPending.mockReturnValue(pending);
    mocks.getUserProfile.mockResolvedValue({ id: 'usr_me', displayName: 'わたし', bio: '', statusDescription: 'EM-ABC234' });
    const i = interaction();

    await handleVerifyButton(i);

    expect(i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(mocks.store.confirm).toHaveBeenCalledWith('me');
    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('申し込みました'));
  });

  it('コードがなければ申し込みにしない', async () => {
    mocks.store.getPending.mockReturnValue(pending);
    mocks.getUserProfile.mockResolvedValue({ id: 'usr_me', displayName: 'わたし', bio: 'よろしく', statusDescription: '' });
    const i = interaction();

    await handleVerifyButton(i);

    expect(mocks.store.confirm).not.toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('見つかりませんでした'));
  });

  it('有効時間が過ぎていたらやり直してもらう', async () => {
    mocks.store.getPending.mockReturnValue({ ...pending, expiresAt: '2000-01-01T00:00:00Z' });
    const i = interaction();

    await handleVerifyButton(i);

    expect(mocks.getUserProfile).not.toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalledWith(expect.stringContaining('/match join'));
  });
});

describe('今夜のボタン', () => {
  const optins = {
    me: { vrcUserId: 'usr_me', displayName: 'わたし', joinedAt: '' },
    you: { vrcUserId: 'usr_you', displayName: 'あなた', joinedAt: '' },
  };

  it('申し込んでいなければ、申し込み方と何が見えるかを案内し、記録は付けない', async () => {
    mocks.store.getOptin.mockReturnValue(undefined);
    const i = interaction();

    await handleTonightButton(i);

    expect(mocks.store.checkIn).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('/match join'), ephemeral: true }));
  });

  it('今夜押した人の中から似ている人を本人にだけ見せる', async () => {
    mocks.store.getOptin.mockReturnValue(optins.me);
    mocks.store.checkIn.mockReturnValue(['you', 'me']);
    mocks.store.optins.mockReturnValue(optins);
    mocks.store.profiles.mockReturnValue({
      generatedAt: '',
      profiles: {
        usr_me: { mix: [1, 0], group: 'Web', tags: ['Web'] },
        usr_you: { mix: [1, 0], group: 'Web', tags: ['Web', 'サーバー'] },
      },
    });
    const i = interaction();

    await handleTonightButton(i);

    const { content, ephemeral } = i.reply.mock.calls[0]?.[0] ?? {};
    expect(ephemeral).toBe(true);
    expect(content).toContain('1. **あなた** — Web（共通のタグ: Web）');
  });

  it('自分のプロフィールがまだなければ、そう伝える', async () => {
    mocks.store.getOptin.mockReturnValue(optins.me);
    mocks.store.checkIn.mockReturnValue(['me']);
    mocks.store.optins.mockReturnValue(optins);
    mocks.store.profiles.mockReturnValue({ generatedAt: '', profiles: {} });
    const i = interaction();

    await handleTonightButton(i);

    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('タグの記録がない') }));
  });
});
