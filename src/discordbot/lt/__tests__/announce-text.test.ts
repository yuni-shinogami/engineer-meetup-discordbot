import { describe, it, expect } from 'vitest';
import {
  buildDiscordAnnounceText,
  buildVrchatAnnounce,
  buildXAnnounceText,
  captureNote,
  speakerLabel,
  weightedLength,
  X_MAX_WEIGHT,
} from '../announce-text';

const source = {
  speakerName: 'ゆに',
  xAccount: 'yuni_shinogami' as string | null,
  title: '型で殴るLT',
  capturePolicy: 'allowed' as const,
  eventDate: '2026-09-04' as string | null,
};

describe('weightedLength', () => {
  it('日本語は2、ラテン文字は1として数える', () => {
    expect(weightedLength('abc')).toBe(3);
    expect(weightedLength('あいう')).toBe(6);
    expect(weightedLength('a あ')).toBe(4);
  });
});

describe('speakerLabel', () => {
  it('X があれば併記する', () => {
    expect(speakerLabel(source)).toBe('ゆに（@yuni_shinogami）');
  });

  it('X が無ければ名前だけ', () => {
    expect(speakerLabel({ ...source, xAccount: null })).toBe('ゆに');
  });
});

describe('captureNote', () => {
  it('撮影・拡散が不可のときだけ注記を出す', () => {
    expect(captureNote({ capturePolicy: 'allowed' })).toBeNull();
    expect(captureNote({ capturePolicy: 'denied' })).toContain('ご遠慮ください');
  });
});

describe('buildXAnnounceText', () => {
  const template = '{date} {time}\n「{title}」\n登壇: {speaker}\n#エンジニア集会';

  it('日付・時間・タイトル・登壇者を差し込む', () => {
    const text = buildXAnnounceText(source, template);

    expect(text).toContain('9月4日(金)');
    expect(text).toContain('22:00〜23:30');
    expect(text).toContain('「型で殴るLT」');
    expect(text).toContain('@yuni_shinogami');
    expect(text).not.toContain('{');
  });

  it('撮影・拡散が不可なら注記を足す', () => {
    expect(buildXAnnounceText({ ...source, capturePolicy: 'denied' }, template))
      .toContain('撮影・SNSへの転載はご遠慮ください');
  });

  it('テンプレートを差し替えられる', () => {
    expect(buildXAnnounceText(source, 'LT: {title}')).toBe('LT: 型で殴るLT');
  });

  // 上限を超えるとポスト自体が拒否されるので、投稿前に必ず収める
  it('タイトルが長すぎても上限に収める', () => {
    const text = buildXAnnounceText({ ...source, title: 'あ'.repeat(300) }, template);

    expect(weightedLength(text)).toBeLessThanOrEqual(X_MAX_WEIGHT);
    expect(text).toContain('…');
  });

  it('縮めるのはタイトルだけで、日付と登壇者は残す', () => {
    const text = buildXAnnounceText({ ...source, title: 'あ'.repeat(300) }, template);

    expect(text).toContain('9月4日(金)');
    expect(text).toContain('@yuni_shinogami');
    expect(text).toContain('#エンジニア集会');
  });
});

describe('buildDiscordAnnounceText', () => {
  it('ロールが指定されていればメンションを先頭に置く', () => {
    expect(buildDiscordAnnounceText(source, 'role-1').startsWith('<@&role-1>')).toBe(true);
  });

  it('ロール未設定ならメンションを入れない', () => {
    expect(buildDiscordAnnounceText(source)).not.toContain('<@&');
  });

  it('X はリンクとして載せる', () => {
    expect(buildDiscordAnnounceText(source)).toContain('https://x.com/yuni_shinogami');
  });
});

describe('buildVrchatAnnounce', () => {
  it('タイトルに日付を含める', () => {
    const { title, body } = buildVrchatAnnounce(source);

    expect(title).toContain('9月4日(金)');
    expect(title).toContain('型で殴るLT');
    expect(body).toContain('登壇: ゆに（@yuni_shinogami）');
  });

  it('長いタイトルでも VRChat の上限 64 文字に収める', () => {
    const { title } = buildVrchatAnnounce({ ...source, title: 'あ'.repeat(200) });

    expect(title.length).toBeLessThanOrEqual(64);
    expect(title).toContain('…');
  });

  it('本文にマークダウンの装飾を入れない', () => {
    expect(buildVrchatAnnounce(source).body).not.toContain('**');
  });
});
