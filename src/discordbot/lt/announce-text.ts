import { readFileSync } from 'fs';
import { join } from 'path';
import { formatMeetupDate } from './dates';
import { LtEntry, needsCaptureWarning } from './types';

/** 集会の開催時間帯。告知文にそのまま載せる。 */
export const MEETUP_TIME = '22:00〜23:30';

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

/** 「ゆに（@handle）」形式。X 未登録なら名前だけ。 */
export function speakerLabel(entry: Pick<LtEntry, 'speakerName' | 'xAccount'>): string {
  return entry.xAccount ? `${entry.speakerName}（@${entry.xAccount}）` : entry.speakerName;
}

/**
 * 撮影・拡散が不可の場合の注記。
 * 参加者に向けた案内なので、告知文そのものに載せないと伝わらない。
 */
export function captureNote(entry: Pick<LtEntry, 'capturePolicy'>): string | null {
  return needsCaptureWarning(entry.capturePolicy)
    ? '※ 当日のスライドの撮影・SNSへの転載はご遠慮ください'
    : null;
}

function readXTemplate(): string {
  return readFileSync(join(__dirname, '../../x/assets/lt_announce_template.txt'), 'utf-8').trim();
}

type AnnounceSource = Pick<LtEntry, 'speakerName' | 'xAccount' | 'title' | 'capturePolicy' | 'eventDate'>;

/**
 * X 向けの告知文。
 * 文面は `src/x/assets/lt_announce_template.txt` で差し替えられる。
 * タイトルが長いと上限を超えるので、収まるまでタイトルだけを詰める。
 */
export function buildXAnnounceText(entry: AnnounceSource, template = readXTemplate()): string {
  const note = captureNote(entry);

  const compose = (title: string) => {
    const body = template
      .replace('{date}', formatMeetupDate(entry.eventDate ?? ''))
      .replace('{time}', MEETUP_TIME)
      .replace('{title}', title)
      .replace('{speaker}', speakerLabel(entry));
    return note ? `${body}\n${note}` : body;
  };

  const full = compose(entry.title);
  if (weightedLength(full) <= X_MAX_WEIGHT) return full;

  // 末尾から 1 文字ずつ削って、省略記号を足しても上限に収まるところまで縮める
  let title = entry.title;
  while (title.length > 1 && weightedLength(compose(`${title}…`)) > X_MAX_WEIGHT) {
    title = title.slice(0, -1);
  }
  return compose(`${title}…`);
}

/** Discord のお知らせチャンネル向け。文字数に余裕があるので装飾とリンクを付ける。 */
export function buildDiscordAnnounceText(entry: AnnounceSource, roleId = ''): string {
  const speaker = entry.xAccount
    ? `${entry.speakerName}（https://x.com/${entry.xAccount}）`
    : entry.speakerName;

  return [
    roleId ? `<@&${roleId}>` : '',
    '📣 **エンジニア集会LT のお知らせ**',
    '',
    `**${formatMeetupDate(entry.eventDate ?? '')} ${MEETUP_TIME}**`,
    `「${entry.title}」`,
    `登壇: ${speaker}`,
    captureNote(entry) ?? '',
  ].filter(Boolean).join('\n');
}

/** VRChat グループ掲示板のタイトル上限（超えると API に弾かれる）。 */
const VRCHAT_TITLE_MAX = 64;

/** VRChat グループ掲示板向け。マークダウンは効かないのでプレーンテキストにする。 */
export function buildVrchatAnnounce(entry: AnnounceSource): { title: string; body: string } {
  const date = formatMeetupDate(entry.eventDate ?? '');
  const prefix = `LT ${date} `;
  const room = VRCHAT_TITLE_MAX - prefix.length;
  const title = prefix + (entry.title.length > room ? `${entry.title.slice(0, room - 1)}…` : entry.title);

  const body = [
    `エンジニア集会LT のお知らせです。`,
    '',
    `${date} ${MEETUP_TIME}`,
    `「${entry.title}」`,
    `登壇: ${speakerLabel(entry)}`,
    captureNote(entry) ?? '',
  ].filter(Boolean).join('\n');

  return { title, body };
}
