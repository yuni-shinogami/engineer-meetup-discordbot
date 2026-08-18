import { readFileSync } from 'fs';
import { join } from 'path';
import { formatDateKey } from './dates';
import { LtEntry } from './types';

/**
 * X の文字数上限。日本語は 1 文字が 2 とカウントされるので、実質 140 文字相当。
 * 上限を超えるとポスト自体が拒否されるため、投稿前にこちらで収める。
 */
export const X_MAX_WEIGHT = 280;

/** X の重み付き文字数。ラテン文字などは 1、日本語を含むそれ以外は 2。 */
export function weightedLength(text: string): number {
  let total = 0;
  for (const char of text) {
    total += (char.codePointAt(0) ?? 0) <= 4351 ? 1 : 2;
  }
  return total;
}

/**
 * 告知文の冒頭に置く時期の言い方。
 * 当日に出すなら「今日の〜」、前日告知に合わせて出すなら「今週の〜」。
 * どちらも実際の運用で使っている表現に合わせている。
 */
export function announceWhen(eventDate: string | null, now: Date = new Date()): string {
  return eventDate && eventDate === formatDateKey(now) ? '今日' : '今週';
}

/**
 * 「暁月蒼空さん @_Sora_Akatuki」形式。X 未登録なら名前だけ。
 * 応募時の名前が既に「さん」で終わっていれば重ねない。
 */
export function speakerLabel(entry: Pick<LtEntry, 'speakerName' | 'xAccount'>): string {
  const name = entry.speakerName.endsWith('さん') ? entry.speakerName : `${entry.speakerName}さん`;
  return entry.xAccount ? `${name} @${entry.xAccount}` : name;
}

function readXTemplate(): string {
  return readFileSync(join(__dirname, '../../x/assets/lt_announce_template.txt'), 'utf-8').trim();
}

/**
 * 撮影・拡散の可否（`capturePolicy`）は告知文には載せない。
 * 参加者向けの注意は当日のアナウンスで扱うため、告知はこれまでどおりの文面のままにしている。
 */
type AnnounceSource = Pick<LtEntry, 'speakerName' | 'xAccount' | 'title' | 'eventDate'>;

/**
 * X 向けの告知文。
 * 文面は `src/x/assets/lt_announce_template.txt` で差し替えられる。
 * タイトルが長いと上限を超えるので、収まるまでタイトルだけを詰める。
 */
export function buildXAnnounceText(
  entry: AnnounceSource,
  template = readXTemplate(),
  now: Date = new Date(),
): string {
  const compose = (title: string) => template
    .replace('{when}', announceWhen(entry.eventDate, now))
    .replace('{speaker}', speakerLabel(entry))
    .replace('{title}', title);

  const full = compose(entry.title);
  if (weightedLength(full) <= X_MAX_WEIGHT) return full;

  // 末尾から 1 文字ずつ削って、省略記号を足しても上限に収まるところまで縮める
  let title = entry.title;
  while (title.length > 1 && weightedLength(compose(`${title}…`)) > X_MAX_WEIGHT) {
    title = title.slice(0, -1);
  }
  return compose(`${title}…`);
}

export interface DiscordAnnounceOptions {
  /** 先頭に飛ばすロールメンション。空なら付けない。 */
  roleId?: string;
  /** 先に投稿した X の LT 告知への URL。まだ出していなければ省く。 */
  xPostUrl?: string | null;
  now?: Date;
}

/**
 * Discord のお知らせチャンネル向け。
 *
 * 開催当日に `/post-announcement` から出す前提なので、週次の開催告知と同じ調子で短くする。
 * 日時を書かないのも同じ理由（「今日」で足りる）。詳細は X の告知へのリンクに任せる。
 */
export function buildDiscordAnnounceText(
  entry: AnnounceSource,
  { roleId = '', xPostUrl = null, now = new Date() }: DiscordAnnounceOptions = {},
): string {
  // 登壇者の X は併記しない（Discord では @ が Discord ユーザーと紛らわしいため）
  const speaker = speakerLabel({ ...entry, xAccount: null });

  return [
    roleId ? `<@&${roleId}>` : null,
    `${announceWhen(entry.eventDate, now)}はLTがあるよー！`,
    `${speaker}の｢${entry.title}｣です！`,
    '良かったらぜひ遊びに来てくださいーー！！',
    xPostUrl,
  ].filter(line => line !== null && line !== '').join('\n');
}

/** VRChat グループ掲示板のタイトル上限（超えると API に弾かれる）。 */
const VRCHAT_TITLE_MAX = 64;

/**
 * VRChat グループ掲示板向け。マークダウンは効かないのでプレーンテキストにする。
 *
 * タイトルに LT のタイトルを入れず登壇者名だけにするのは、掲示板の一覧で読み切れる長さに
 * するため（実運用の文面もそうなっている）。詳しくは本文に書く。
 */
export function buildVrchatAnnounce(
  entry: AnnounceSource,
  now: Date = new Date(),
): { title: string; body: string } {
  const when = announceWhen(entry.eventDate, now);
  // 登壇者は「さん」付きの名前のみ。X ハンドルは VRChat では意味を持たない
  const speaker = speakerLabel({ ...entry, xAccount: null });

  const title = `${when}は${speaker}の LT があります！`;

  const body = [
    `${when}は${speaker}の LT がありますーーー！！`,
    `タイトルは、「${entry.title}」です！`,
    'よかったら遊びに来てねーーー！！',
  ].join('\n');

  return {
    title: title.length > VRCHAT_TITLE_MAX
      ? `${title.slice(0, VRCHAT_TITLE_MAX - 1)}…`
      : title,
    body,
  };
}
