import { describe, it, expect } from 'vitest';
import {
  ARCHIVE_POLICIES,
  ARCHIVE_POLICY_CHOICES,
  ARCHIVE_POLICY_SHORT,
  CAPTURE_POLICIES,
  CAPTURE_POLICY_CHOICES,
  CAPTURE_POLICY_SHORT,
  canArchive,
  isArchivePolicy,
  isCapturePolicy,
  needsCaptureWarning,
  needsTitle,
  newLtEntry,
  normalizeXAccount,
  outstandingItems,
} from '../types';

describe('ポリシーの選択肢', () => {
  it('撮影・拡散と録画公開はそれぞれ独立した設問として持つ', () => {
    expect(CAPTURE_POLICY_CHOICES.map(c => c.value)).toEqual([...CAPTURE_POLICIES]);
    expect(ARCHIVE_POLICY_CHOICES.map(c => c.value)).toEqual([...ARCHIVE_POLICIES]);
  });

  it('選択肢の数は設問ごとに 2 個・3 個に収まる', () => {
    expect(CAPTURE_POLICY_CHOICES).toHaveLength(2);
    expect(ARCHIVE_POLICY_CHOICES).toHaveLength(3);
  });

  it('文言は Discord のセレクト上限 100 文字に収まる', () => {
    for (const { label, description } of [...CAPTURE_POLICY_CHOICES, ...ARCHIVE_POLICY_CHOICES]) {
      expect(label.length).toBeLessThanOrEqual(100);
      expect(description.length).toBeLessThanOrEqual(100);
    }
  });

  it('説明文で行為者が分かる', () => {
    expect(CAPTURE_POLICY_CHOICES.map(c => c.description).join()).toContain('参加者');
    expect(ARCHIVE_POLICY_CHOICES.map(c => c.description).join()).toMatch(/YouTube/);
  });

  it('型ガードは未知の値を弾く', () => {
    expect(isCapturePolicy('allowed')).toBe(true);
    expect(isCapturePolicy('public')).toBe(false);
    expect(isArchivePolicy('unlisted')).toBe(true);
    expect(isArchivePolicy('allowed')).toBe(false);
  });
});

describe('ポリシーの判定', () => {
  it('全ての値に短縮表記がある', () => {
    for (const policy of CAPTURE_POLICIES) expect(CAPTURE_POLICY_SHORT[policy]).toBeTruthy();
    for (const policy of ARCHIVE_POLICIES) expect(ARCHIVE_POLICY_SHORT[policy]).toBeTruthy();
  });

  it('参加者の撮影が不可のときだけ当日の注意喚起が要る', () => {
    expect(needsCaptureWarning('allowed')).toBe(false);
    expect(needsCaptureWarning('denied')).toBe(true);
  });

  it('限定公開もアーカイブ作業の対象に含む', () => {
    expect(canArchive('public')).toBe(true);
    expect(canArchive('unlisted')).toBe(true);
    expect(canArchive('none')).toBe(false);
  });
});

describe('newLtEntry', () => {
  const input = {
    id: '1',
    isProd: true,
    speakerId: 'u1',
    speakerName: 'ゆに',
    title: '未定',
    durationMin: 10,
    capturePolicy: 'denied',
    archivePolicy: 'public',
  } as const;

  it('応募直後は applied / 希望日なし / 日程未確定', () => {
    const entry = newLtEntry({ ...input }, '2026-08-11T00:00:00.000Z');

    expect(entry.status).toBe('applied');
    expect(entry.preferredDates).toEqual([]);
    expect(entry.scheduleNote).toBe('');
    expect(entry.eventDate).toBeNull();
    expect(entry.createdAt).toBe('2026-08-11T00:00:00.000Z');
    expect(entry.updatedAt).toBe('2026-08-11T00:00:00.000Z');
  });

  it('撮影と録画公開を独立したフィールドとして保持する', () => {
    const entry = newLtEntry({ ...input }, '2026-08-11T00:00:00.000Z');

    expect(entry.capturePolicy).toBe('denied');
    expect(entry.archivePolicy).toBe('public');
  });

  it('動画再生はポスト側で答えるため未回答（null）で始まる', () => {
    // false に倒すと「動画なし」と区別できず、ワールド準備の確認漏れにつながる
    const entry = newLtEntry({ ...input }, '2026-08-11T00:00:00.000Z');
    expect(entry.videoPlayback).toBeNull();
  });

  it('告知結果は全媒体とも未投稿で初期化される', () => {
    const entry = newLtEntry({ ...input }, '2026-08-11T00:00:00.000Z');

    for (const target of [entry.announce.x, entry.announce.discord, entry.announce.vrchat]) {
      expect(target).toEqual({ ref: null, postedAt: null });
    }
  });
});

describe('needsTitle', () => {
  it('フォームの案内どおり「未定」と書かれていたら未定として扱う', () => {
    expect(needsTitle('未定')).toBe(true);
    expect(needsTitle(' 未定 ')).toBe(true);
    expect(needsTitle('未定です。')).toBe(true);
    expect(needsTitle('TBD')).toBe(true);
  });

  it('空欄も未定として扱う', () => {
    expect(needsTitle('')).toBe(true);
    expect(needsTitle('   ')).toBe(true);
  });

  it('タイトルが書かれていれば未定ではない', () => {
    expect(needsTitle('未定義動作の話')).toBe(false);
    expect(needsTitle('LT のタイトル')).toBe(false);
  });
});

describe('normalizeXAccount', () => {
  it('@ 付き・無しのどちらも ID に揃える', () => {
    expect(normalizeXAccount('@example')).toBe('example');
    expect(normalizeXAccount('example')).toBe('example');
    expect(normalizeXAccount('  @Example_1 ')).toBe('Example_1');
  });

  it('プロフィール URL を貼られても ID を取り出す', () => {
    expect(normalizeXAccount('https://x.com/example')).toBe('example');
    expect(normalizeXAccount('https://twitter.com/example')).toBe('example');
    expect(normalizeXAccount('https://x.com/example?s=20')).toBe('example');
  });

  it('X の ID として成立しない入力は null', () => {
    expect(normalizeXAccount('')).toBeNull();
    expect(normalizeXAccount('@')).toBeNull();
    expect(normalizeXAccount('ゆに')).toBeNull();
    expect(normalizeXAccount('a'.repeat(16))).toBeNull();
  });
});

describe('outstandingItems', () => {
  const filled = { title: 'LTのタイトル', xAccount: 'example', videoPlayback: true };

  it('すべて埋まっていれば空', () => {
    expect(outstandingItems(filled)).toEqual([]);
  });

  it('タイトル未定・X未登録・動画再生未回答をそれぞれ拾う', () => {
    expect(outstandingItems({ ...filled, title: '未定' }).join()).toContain('タイトル');
    expect(outstandingItems({ ...filled, xAccount: null }).join()).toContain('X アカウント');
    expect(outstandingItems({ ...filled, videoPlayback: null }).join()).toContain('動画');
  });

  it('動画再生は「いいえ」でも回答済みとして扱う', () => {
    expect(outstandingItems({ ...filled, videoPlayback: false })).toEqual([]);
  });

  it('応募直後は X アカウントが未登録として残る', () => {
    const entry = newLtEntry({
      id: 't1',
      isProd: true,
      speakerId: 'u1',
      speakerName: 'ゆに',
      title: 'LTのタイトル',
      durationMin: 10,
      capturePolicy: 'allowed',
      archivePolicy: 'public',
    }, '2026-08-11T00:00:00.000Z');

    expect(entry.xAccount).toBeNull();
    expect(outstandingItems(entry).join()).toContain('X アカウント');
  });
});
