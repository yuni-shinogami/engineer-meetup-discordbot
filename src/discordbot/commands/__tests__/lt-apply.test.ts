import { describe, it, expect, vi } from 'vitest';
import { ComponentType } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

vi.mock('../../config', () => ({
  config: {
    ltForumChannelId: 'prod-forum',
    testLtForumChannelId: 'test-forum',
    operationsChannelId: 'ops-channel',
    testChannelId: 'test-channel',
    ltStorePath: './lt-store.test.json',
    ltSlotsPerDay: 1,
    ltDateCandidates: 8,
    meetupWeekday: 5,
  },
  ltForumChannelId: (isProd: boolean) => (isProd ? 'prod-forum' : 'test-forum'),
}));

vi.mock('../../lt/store', () => ({
  ltStore: {
    get: vi.fn(),
    create: vi.fn(),
    findBySpeaker: vi.fn(() => []),
    slotUsageByDate: vi.fn(() => new Map<string, number>()),
  },
}));

import { handleLtApplyCommand, ltApplyCommand, parseDuration } from '../lt-apply';
import { ARCHIVE_POLICY_CHOICES, CAPTURE_POLICY_CHOICES } from '../../lt/types';

describe('parseDuration', () => {
  it('半角数字をそのまま分として読む', () => {
    expect(parseDuration('10')).toBe(10);
    expect(parseDuration(' 5 ')).toBe(5);
  });

  it('全角数字を受け付ける', () => {
    expect(parseDuration('１０')).toBe(10);
  });

  it('単位が付いていても数値を取り出す', () => {
    expect(parseDuration('10分')).toBe(10);
    expect(parseDuration('15min')).toBe(15);
  });

  it('範囲外は null', () => {
    expect(parseDuration('0')).toBeNull();
    expect(parseDuration('121')).toBeNull();
  });

  it('数値で始まらない入力は null', () => {
    expect(parseDuration('じゅっぷん')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('約10分')).toBeNull();
  });
});

describe('ltApplyCommand', () => {
  // 応募するのは一般の登壇者なので、本番／テストの区別を入力させない
  it('オプションを持たない', () => {
    const json = ltApplyCommand.toJSON();
    expect(json.name).toBe('lt-apply');
    expect(json.options ?? []).toEqual([]);
  });
});

/** `channel` を省略すると通常のテキストチャンネルからの実行になる。 */
async function showModalPayload(channel?: { id: string; parentId?: string }) {
  const showModal = vi.fn().mockResolvedValue(undefined);
  const isThread = channel?.parentId !== undefined;
  const interaction = {
    channelId: channel?.id ?? 'general-channel',
    channel: { isThread: () => isThread, parentId: channel?.parentId ?? null },
    member: null,
    user: { id: 'u1', displayName: 'ゆに' },
    showModal,
  } as unknown as ChatInputCommandInteraction;

  await handleLtApplyCommand(interaction);
  return showModal.mock.calls[0]![0].toJSON();
}

describe('応募モーダル', () => {
  it('Discord の上限どおりコンポーネントは 5 個以内に収まる', async () => {
    const modal = await showModalPayload();
    // API 仕様: modal の components は 1〜5 個
    expect(modal.components.length).toBeLessThanOrEqual(5);
    expect(modal.components.length).toBe(5);
  });

  it('フォームの設問が漏れなく含まれている', async () => {
    const modal = await showModalPayload();
    const ids = modal.components.map((c: { component: { custom_id: string } }) => c.component.custom_id);
    expect(ids).toEqual(['speakerName', 'title', 'durationMin', 'capturePolicy', 'archivePolicy']);
  });

  it('動画再生はモーダルの5枠に収まらないためポスト側で聞く', async () => {
    const modal = await showModalPayload();
    const ids = modal.components.map((c: { component: { custom_id: string } }) => c.component.custom_id);
    expect(ids).not.toContain('videoPlayback');
  });

  it('Discordユーザー名は interaction から取れるので設問に含めない', async () => {
    const modal = await showModalPayload();
    const ids = modal.components.map((c: { component: { custom_id: string } }) => c.component.custom_id);
    expect(ids).not.toContain('discordUsername');
  });

  it('撮影・拡散と録画公開はセレクトで受け取る', async () => {
    const modal = await showModalPayload();
    const selects = modal.components.filter(
      (c: { component: { type: number } }) => c.component.type === ComponentType.StringSelect,
    );
    expect(selects).toHaveLength(2);
  });

  it('撮影・拡散と録画公開は別々の設問で、選択肢は 2 個・3 個', async () => {
    const modal = await showModalPayload();
    const byId = (id: string) => modal.components.find(
      (c: { component: { custom_id: string } }) => c.component.custom_id === id,
    );

    expect(byId('capturePolicy').component.options.map((o: { value: string }) => o.value))
      .toEqual(CAPTURE_POLICY_CHOICES.map(c => c.value));
    expect(byId('archivePolicy').component.options.map((o: { value: string }) => o.value))
      .toEqual(ARCHIVE_POLICY_CHOICES.map(c => c.value));
  });

  it('設問文でそれぞれ誰の行為かを明示する', async () => {
    const modal = await showModalPayload();
    const byId = (id: string) => modal.components.find(
      (c: { component: { custom_id: string } }) => c.component.custom_id === id,
    );

    expect(byId('capturePolicy').label).toContain('参加者');
    expect(byId('capturePolicy').description).toContain('スライド');
    expect(byId('archivePolicy').label).toContain('YouTube');
    expect(byId('archivePolicy').description).toContain('録画');
  });

  it('発表者の名前は Discord の表示名で初期化される', async () => {
    const modal = await showModalPayload();
    const name = modal.components.find(
      (c: { component: { custom_id: string } }) => c.component.custom_id === 'speakerName',
    );
    expect(name.component.value).toBe('ゆに');
  });

  // テストフォーラムに落ちた応募は運営の目に触れず、登壇者からは受理されたように見える
  it('通常のチャンネルからの応募は本番フォーラムに向かう', async () => {
    const modal = await showModalPayload();
    expect(modal.custom_id).toBe('lt:apply:1');
    expect(modal.title).toBe('LT応募フォーム');
  });

  it('運営のテストチャンネルで実行したときだけテスト扱いにする', async () => {
    const modal = await showModalPayload({ id: 'test-channel' });
    expect(modal.custom_id).toBe('lt:apply:0');
    // 送信前にテストだと分かるようにする（本番の応募と取り違えないため）
    expect(modal.title).toContain('テスト');
  });

  it('テスト LT フォーラムのポスト内での実行もテスト扱いにする', async () => {
    const modal = await showModalPayload({ id: 'some-post', parentId: 'test-forum' });
    expect(modal.custom_id).toBe('lt:apply:0');
  });

  it('本番 LT フォーラムのポスト内での実行は本番のまま', async () => {
    const modal = await showModalPayload({ id: 'some-post', parentId: 'prod-forum' });
    expect(modal.custom_id).toBe('lt:apply:1');
  });
});
