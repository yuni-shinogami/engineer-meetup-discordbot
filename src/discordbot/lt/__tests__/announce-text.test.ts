import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  announceWhen,
  buildDiscordAnnounceText,
  buildVrchatAnnounce,
  buildXAnnounceText,
  speakerLabel,
  weightedLength,
  X_MAX_WEIGHT,
} from '../announce-text';

const source = {
  speakerName: '暁月蒼空',
  xAccount: '_Sora_Akatuki' as string | null,
  title: 'クラスタは偶像だ',
  eventDate: '2026-09-04' as string | null,
};

/** 前日告知を流す木曜。実運用ではここで LT 告知も出す。 */
const THURSDAY = new Date(2026, 8, 3);
/** 開催日の金曜。当日に手で出し直したときの想定。 */
const FRIDAY = new Date(2026, 8, 4);

describe('weightedLength', () => {
  it('日本語は2、ラテン文字は1として数える', () => {
    expect(weightedLength('abc')).toBe(3);
    expect(weightedLength('あいう')).toBe(6);
    expect(weightedLength('a あ')).toBe(4);
  });
});

describe('announceWhen', () => {
  it('開催日当日なら「今日」', () => {
    expect(announceWhen('2026-09-04', FRIDAY)).toBe('今日');
  });

  it('前日告知のタイミングなら「今週」', () => {
    expect(announceWhen('2026-09-04', THURSDAY)).toBe('今週');
  });

  it('開催日が無ければ「今週」に倒す', () => {
    expect(announceWhen(null, THURSDAY)).toBe('今週');
  });
});

describe('speakerLabel', () => {
  it('「さん」付きの名前と X アカウントを並べる', () => {
    expect(speakerLabel(source)).toBe('暁月蒼空さん @_Sora_Akatuki');
  });

  it('X が無ければ名前だけ', () => {
    expect(speakerLabel({ ...source, xAccount: null })).toBe('暁月蒼空さん');
  });

  it('既に「さん」で終わる名前には重ねない', () => {
    expect(speakerLabel({ ...source, speakerName: 'ゆにさん' })).toBe('ゆにさん @_Sora_Akatuki');
  });
});

describe('buildXAnnounceText', () => {
  const template = readFileSync(
    join(__dirname, '../../../x/assets/lt_announce_template.txt'), 'utf-8',
  ).trim();

  // 普段の投稿と同じ文面になっていることが、この機能でいちばん大事な部分
  it('普段の告知文をそのまま組み立てる', () => {
    expect(buildXAnnounceText(source, template, THURSDAY)).toBe(
      '今週のエンジニア集会ではLTがあります！\n'
      + '\n'
      + '暁月蒼空さん @_Sora_Akatuki の｢クラスタは偶像だ｣です！\n'
      + '\n'
      + '良かったらぜひ遊びに来てくださいーー！！\n'
      + '#エンジニア集会',
    );
  });

  it('当日に出すと「今日の」になる', () => {
    expect(buildXAnnounceText(source, template, FRIDAY)).toContain('今日のエンジニア集会');
  });

  it('X 未登録なら名前だけで組み立てる', () => {
    expect(buildXAnnounceText({ ...source, xAccount: null }, template, THURSDAY))
      .toContain('暁月蒼空さん の｢クラスタは偶像だ｣です！');
  });

  // 撮影・拡散の可否は応募フォームでは取るが、告知文には出さない運用
  it('撮影・拡散の注記は載せない', () => {
    const text = buildXAnnounceText(source, template, THURSDAY);

    expect(text).not.toContain('ご遠慮ください');
    expect(text.trimEnd().endsWith('#エンジニア集会')).toBe(true);
  });

  it('テンプレートを差し替えられる', () => {
    expect(buildXAnnounceText(source, 'LT: {title}', THURSDAY)).toBe('LT: クラスタは偶像だ');
  });

  // 上限を超えるとポスト自体が拒否されるので、投稿前に必ず収める
  it('タイトルが長すぎても上限に収める', () => {
    const text = buildXAnnounceText({ ...source, title: 'あ'.repeat(300) }, template, THURSDAY);

    expect(weightedLength(text)).toBeLessThanOrEqual(X_MAX_WEIGHT);
    expect(text).toContain('…');
  });

  it('縮めるのはタイトルだけで、登壇者とハッシュタグは残す', () => {
    const text = buildXAnnounceText({ ...source, title: 'あ'.repeat(300) }, template, THURSDAY);

    expect(text).toContain('暁月蒼空さん @_Sora_Akatuki');
    expect(text).toContain('#エンジニア集会');
  });
});

describe('buildDiscordAnnounceText', () => {
  const xUrl = 'https://x.com/VRENGAssoc/status/2060342403836649944';

  // 当日の開催告知に乗せる文面。実運用のメッセージをそのまま再現する
  it('普段の告知文をそのまま組み立てる', () => {
    const text = buildDiscordAnnounceText(source, { roleId: 'role-1', xPostUrl: xUrl, now: FRIDAY });

    expect(text).toBe(
      '<@&role-1>\n'
      + '今日はLTがあるよー！\n'
      + '暁月蒼空さんの｢クラスタは偶像だ｣です！\n'
      + '良かったらぜひ遊びに来てくださいーー！！\n'
      + xUrl,
    );
  });

  it('ロール未設定ならメンションを入れない', () => {
    expect(buildDiscordAnnounceText(source, { now: FRIDAY })).not.toContain('<@&');
  });

  it('X の告知がまだなら URL の行を落とす', () => {
    const text = buildDiscordAnnounceText(source, { now: FRIDAY });

    expect(text.endsWith('良かったらぜひ遊びに来てくださいーー！！')).toBe(true);
  });

  // Discord では @ が Discord ユーザーのメンションと紛らわしい
  it('登壇者の X ハンドルは併記しない', () => {
    expect(buildDiscordAnnounceText(source, { now: FRIDAY })).not.toContain('@_Sora_Akatuki');
  });

  it('前日に出せば「今週は」になる', () => {
    expect(buildDiscordAnnounceText(source, { now: THURSDAY })).toContain('今週はLTがあるよー！');
  });
});

describe('buildVrchatAnnounce', () => {
  // 当日の開催告知に乗せる文面。実運用の掲示板投稿をそのまま再現する
  it('普段の告知文をそのまま組み立てる', () => {
    const { title, body } = buildVrchatAnnounce(source, FRIDAY);

    expect(title).toBe('今日は暁月蒼空さんの LT があります！');
    expect(body).toBe(
      '今日は暁月蒼空さんの LT がありますーーー！！\n'
      + 'タイトルは、「クラスタは偶像だ」です！\n'
      + 'よかったら遊びに来てねーーー！！',
    );
  });

  // 掲示板の一覧で読み切れるよう、タイトルには LT のタイトルを入れない
  it('タイトルは長い LT タイトルの影響を受けない', () => {
    const { title } = buildVrchatAnnounce({ ...source, title: 'あ'.repeat(200) }, FRIDAY);

    expect(title).toBe('今日は暁月蒼空さんの LT があります！');
  });

  it('登壇者名が長くても VRChat の上限 64 文字に収める', () => {
    const { title } = buildVrchatAnnounce({ ...source, speakerName: 'あ'.repeat(200) }, FRIDAY);

    expect(title.length).toBeLessThanOrEqual(64);
    expect(title).toContain('…');
  });

  it('前日に出せば「今週は」になる', () => {
    expect(buildVrchatAnnounce(source, THURSDAY).title).toBe('今週は暁月蒼空さんの LT があります！');
  });

  it('本文にマークダウンの装飾を入れない', () => {
    expect(buildVrchatAnnounce(source, FRIDAY).body).not.toContain('**');
  });
});
