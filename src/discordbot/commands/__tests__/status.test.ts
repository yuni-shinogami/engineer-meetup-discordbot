import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config', () => ({
  config: {
    operatorRoleId: 'operator-role',
    operationsChannelId: 'ops-id',
    publicChannelId: 'public-id',
    testChannelId: 'test-id',
    vrcStateDir: '',
    ltForumChannelId: '',
    testLtForumChannelId: '',
    ltStorePath: '',
  },
  ltForumChannelId: () => '',
}));

const { ltList } = vi.hoisted(() => ({ ltList: vi.fn((): unknown[] => []) }));

vi.mock('../../lt/store', () => ({
  ltStore: { list: ltList },
}));

vi.mock('../../storage', () => ({
  storage: {
    isScheduled: true,
    preAnnouncePostUrl: 'https://x.com/foo/status/1',
    lastInviteUrl: 'https://vrchat.com/i/abc',
  },
}));

import { handleStatusCommand } from '../status';
import type { ChatInputCommandInteraction } from 'discord.js';

function makeInteraction(memberRoles = ['operator-role']) {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn().mockResolvedValue({});
  const interaction = {
    member: { roles: memberRoles },
    deferReply,
    editReply,
    reply,
    client: { channels: { fetch } },
  };
  return interaction as unknown as ChatInputCommandInteraction & {
    deferReply: typeof deferReply;
    editReply: typeof editReply;
    reply: typeof reply;
  };
}

describe('handleStatusCommand', () => {
  beforeEach(() => {
    ltList.mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('権限が無い場合は deferReply/editReply せず reply のみ行う', async () => {
    const interaction = makeInteraction(['other-role']);

    await handleStatusCommand(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('X APIキーが両方設定されていれば設定済みと表示する', async () => {
    vi.stubEnv('X_API_KEY', 'a');
    vi.stubEnv('TEST_X_API_KEY', 'b');
    const interaction = makeInteraction();

    await handleStatusCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('✅ X API 認証情報: 設定済み');
  });

  it('X APIキーが片方でも欠けていれば未設定と表示する', async () => {
    vi.stubEnv('X_API_KEY', '');
    vi.stubEnv('TEST_X_API_KEY', 'b');
    const interaction = makeInteraction();

    await handleStatusCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('❌ X API 認証情報: 未設定');
  });

  it('storage の開催状況・URLを本文に反映する', async () => {
    const interaction = makeInteraction();

    await handleStatusCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('YES（木曜19時に事前告知を自動投稿）');
    expect(message).toContain('https://x.com/foo/status/1');
    expect(message).toContain('https://vrchat.com/i/abc');
  });

  it('LTフォーラム未設定なら LT セクションにその旨を表示する', async () => {
    const interaction = makeInteraction();

    await handleStatusCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]!;
    expect(message).toContain('**LT 応募**');
    expect(message).toContain('❌ LTフォーラム（本番）: 未設定');
    expect(message).toContain('❌ LTフォーラム（テスト）: 未設定');
    expect(message).toContain('全 0 件');
    expect(message).toContain('・確定済みの登壇: なし');
  });

  it('確定済みの登壇を開催日の早い順に表示する', async () => {
    ltList.mockReturnValue([
      { eventDate: '2099-02-06', status: 'scheduled', speakerName: 'あとの人', title: 'B' },
      { eventDate: '2099-01-02', status: 'ready', speakerName: 'さきの人', title: 'A' },
      // 取り下げ・日程未定・過去の開催は一覧に出さない
      { eventDate: '2099-03-06', status: 'cancelled', speakerName: '取り下げ', title: 'C' },
      { eventDate: null, status: 'applied', speakerName: '未定の人', title: 'D' },
      { eventDate: '2020-01-03', status: 'done', speakerName: '過去の人', title: 'E' },
    ]);
    const interaction = makeInteraction();

    await handleStatusCommand(interaction);

    const [message] = interaction.editReply.mock.calls[0]! as [string];
    expect(message).toContain('さきの人「A」（準備完了）');
    expect(message).toContain('あとの人「B」（日程確定）');
    expect(message.indexOf('さきの人')).toBeLessThan(message.indexOf('あとの人'));
    expect(message).not.toContain('取り下げ「C」');
    expect(message).not.toContain('未定の人');
    expect(message).not.toContain('過去の人');
  });
});
