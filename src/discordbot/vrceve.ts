import { execFile } from 'child_process';
import { AttachmentBuilder } from 'discord.js';
import { config } from './config';
import { storage } from './storage';
import { ltEntriesForMeetup, nextMeetupDate } from './lt/weekly-announce';
import { needsTitle, type LtEntry } from './lt/types';

/**
 * VRChat イベントカレンダー（https://vrceve.com/）への登録。
 *
 * 登録は Google フォームで、送る人が Google にログインしている必要がある（荒らし対策でメールアドレスを記録する）。
 * そのため、集会用アカウントでログインした Chrome を置いたデスクトップ VM（browser-desktop/）に SSH で頼み、
 * VM がフォームに入力して送る。送信後に出る編集用 URL を控えておき、開催を取りやめたらその URL から削除する。
 *
 * 開催確認で YES になったら登録する。テストチャンネルの YES では送らずに、入力した画面だけを返す。
 */

/** フォームの内容。LT がある週はイベント名と内容に LT を足す（vrceveFields）。 */
const EVENT_NAME = 'エンジニア集会';
/** 集会の時刻（日本時間）。VRChat のグループのイベント（vrc-event.ts）でも使う。 */
export const MEETUP_START_TIME = '22:00';
export const MEETUP_END_TIME = '23:30';
const START_TIME = MEETUP_START_TIME;
const END_TIME = MEETUP_END_TIME;
const DESCRIPTION = [
  'VRChat のお友達と技術の雑談を楽しんだり、お酒を飲みながら雑談＆作業をしよう！という集会です。',
  'ハードウェア、ソフトウェアなど技術分野は問いません。どのような形でも、技術と関わりのある方でしたら参加OKです！',
].join('\n');
const BASE_FIELDS = {
  android: 'PC/android',
  action: 'イベントを登録する',
  organizer: '慕狼ゆに',
  genres: ['その他交流会', 'VR飲み会', '学術系イベント', '定期イベント'],
  conditions: '技術と関わりのある方ならどなたでも参加できます。グループ「エンジニア集会」への参加が必要です。',
  how_to_join: 'グループインスタンスから参加してください。インスタンスは当日 Discord と X で案内します。',
  notes: [
    'X: https://x.com/VRENGAssoc',
    'Discord: https://discord.gg/zaTjFtDRP7',
    'Web: https://engineer-meetup.com/',
  ].join('\n'),
};

/** イベント名の上限。カレンダーや VRChat の表示で切れないよう、LT のタイトルを足しても長くしすぎない。 */
const NAME_MAX = 60;

/** フォームの読み込み・入力・送信まで。2 ページあり、Google の応答待ちもあるので長めに待つ。 */
const SSH_TIMEOUT_MS = 180_000;

export type VrceveFields = typeof BASE_FIELDS & {
  name: string;
  start: string;
  end: string;
  description: string;
};

export function isVrceveConfigured(): boolean {
  return Boolean(config.vrceveSshTarget && config.vrceveSshKey);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * その開催日のフォームの内容。LT がある週は、イベント名に「【LTあり】タイトル」を、内容に LT の一覧を足す。
 * タイトルが未定の LT は、イベント名には出さず内容にだけ「タイトル未定」で載せる。
 */
export function vrceveFields(eventDate: string, lts: LtEntry[]): VrceveFields {
  const titles = lts.filter(entry => !needsTitle(entry.title)).map(entry => entry.title);
  const name = lts.length === 0
    ? EVENT_NAME
    : truncate(`${EVENT_NAME}【LTあり】${titles.join(' / ')}`, NAME_MAX);
  const ltLines = lts.map(entry =>
    `・${needsTitle(entry.title) ? '（タイトル未定）' : `「${entry.title}」`} / ${entry.speakerName}`);
  return {
    ...BASE_FIELDS,
    name,
    start: `${eventDate} ${START_TIME}`,
    end: `${eventDate} ${END_TIME}`,
    description: ltLines.length > 0 ? `${DESCRIPTION}\n\n【今週の LT】\n${ltLines.join('\n')}` : DESCRIPTION,
  };
}

type VrceveVerb = 'register' | 'delete' | 'check';

/**
 * デスクトップ VM に SSH し、登録スクリプトに 1 つ指示を送る。
 * 接続先の鍵は request.sh に固定してあるので、送るのは「動詞 + base64url の JSON」だけ。返事は JSON 1 行。
 */
export function callVrceve<T = Record<string, unknown>>(verb: VrceveVerb, payload?: Record<string, unknown>): Promise<T> {
  const request = payload
    ? `${verb} ${Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')}`
    : verb;
  const args = [
    '-n',
    '-i', config.vrceveSshKey,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=10',
    config.vrceveSshTarget,
    request,
  ];
  return new Promise((resolve, reject) => {
    execFile('ssh', args, { timeout: SSH_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      const line = stdout.trim().split('\n').pop() ?? '';
      let reply: { ok?: boolean; error?: string } | null = null;
      try {
        reply = JSON.parse(line);
      } catch {
        // JSON が返らないのは SSH の段階で失敗したとき
      }
      if (reply?.ok) {
        const { ok: _ok, ...rest } = reply;
        resolve(rest as T);
        return;
      }
      reject(new Error(reply?.error || stderr.trim().split('\n')[0] || error?.message || 'デスクトップ VM から応答がありません'));
    });
  });
}

export interface VrceveReport {
  content: string;
  files?: AttachmentBuilder[];
}

/**
 * 次の開催日を VRChat イベントカレンダーに登録する。登録済みなら何もしない（YES を押し直したときなど）。
 * テスト（isProd=false）では送らずに、入力した画面を添付して返す。
 */
export async function registerOnVrceve(isProd: boolean, now: Date = new Date()): Promise<VrceveReport | null> {
  if (!isVrceveConfigured()) return null;
  if (isProd && storage.vrceveEditUrl) {
    return { content: `📅 VRChat イベントカレンダーには登録済みです。\n編集用 URL: <${storage.vrceveEditUrl}>` };
  }
  const eventDate = nextMeetupDate(now);
  const fields = vrceveFields(eventDate, ltEntriesForMeetup(eventDate, isProd));
  try {
    if (!isProd) {
      const result = await callVrceve<{ images?: string[] }>('register', { fields, dry_run: true });
      return {
        content: `🧪 VRChat イベントカレンダーの登録（テストなので送信していません）: **${fields.name}**（${eventDate} ${START_TIME}〜${END_TIME}）`,
        files: (result.images ?? []).map((image, i) =>
          new AttachmentBuilder(Buffer.from(image, 'base64'), { name: `vrceve-${i + 1}.jpg` })),
      };
    }
    const result = await callVrceve<{ edit_url: string }>('register', { fields });
    storage.vrceveEditUrl = result.edit_url;
    return {
      content: [
        `📅 VRChat イベントカレンダーに登録しました: **${fields.name}**（${eventDate} ${START_TIME}〜${END_TIME}）`,
        `編集用 URL（内容を直す・取り消すときに使います）: <${result.edit_url}>`,
      ].join('\n'),
    };
  } catch (error) {
    console.error('registerOnVrceve failed:', error);
    return { content: `❌ VRChat イベントカレンダーに登録できませんでした: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** 開催を取りやめたとき、登録済みのイベントをカレンダーから削除する。登録していなければ何もしない。 */
export async function deleteFromVrceve(): Promise<VrceveReport | null> {
  const editUrl = storage.vrceveEditUrl;
  if (!isVrceveConfigured() || !editUrl) return null;
  try {
    await callVrceve('delete', { edit_url: editUrl });
    storage.vrceveEditUrl = null;
    return { content: '🗑️ VRChat イベントカレンダーから今週の集会を削除しました。' };
  } catch (error) {
    console.error('deleteFromVrceve failed:', error);
    return {
      content: `❌ VRChat イベントカレンダーから削除できませんでした: ${error instanceof Error ? error.message : String(error)}\n`
        + `編集用 URL から「イベントを削除する」で取り消してください: <${editUrl}>`,
    };
  }
}
