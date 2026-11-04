import { storage } from '../../storage';
import { ltEntriesForMeetup, nextMeetupDate } from '../lt/index';
import { MEETUP_END_TIME, MEETUP_START_TIME, vrceveFields } from './vrceve';
import { createMeetupEvent, deleteMeetupEvent } from '../../../vrchat/groupEvent';

/**
 * VRChat のグループのイベント（VRChat の「イベント」に載るカレンダー）への登録。
 * 開催確認で YES になったら作り、取りやめたら消す。タイトル・内容・時刻は VRChat イベントカレンダー（vrceve）と共通。
 */

/**
 * 日本時間の日付と時刻を、VRChat が受け付ける UTC の ISO 形式（`2026-11-06T13:00:00.000Z`）にする。
 * `+09:00` のようにオフセットを付けた形は 400（startsAt must be a valid ISO Date string）で弾かれる。
 */
export function jstToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

/** 次の開催日のイベントを作る。本番で作成済みなら作らない（YES を押し直したときなど）。結果の報告文を返す。 */
export async function registerVrcEvent(isProd: boolean, now: Date = new Date()): Promise<string> {
  if (isProd && storage.vrcEvent) {
    return '🗓️ VRChat のグループのイベントには登録済みです。';
  }
  const eventDate = nextMeetupDate(now);
  const fields = vrceveFields(eventDate, ltEntriesForMeetup(eventDate, isProd));
  const when = `${eventDate} ${MEETUP_START_TIME}〜${MEETUP_END_TIME}`;
  try {
    const ref = await createMeetupEvent(isProd, {
      title: fields.name,
      description: fields.description,
      startsAt: jstToIso(eventDate, MEETUP_START_TIME),
      endsAt: jstToIso(eventDate, MEETUP_END_TIME),
    });
    if (!isProd) return `🧪 テスト用のグループにイベントを作りました（グループ内だけに公開）: **${fields.name}**（${when}）`;
    storage.vrcEvent = ref;
    return `🗓️ VRChat のグループのイベントに登録しました: **${fields.name}**（${when}）`;
  } catch (error) {
    console.error('registerVrcEvent failed:', error);
    return `❌ VRChat のグループのイベントに登録できませんでした: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** 開催を取りやめたとき、作ったイベントを消す。作っていなければ null。 */
export async function deleteVrcEvent(): Promise<string | null> {
  const ref = storage.vrcEvent;
  if (!ref) return null;
  try {
    await deleteMeetupEvent(ref);
    storage.vrcEvent = null;
    return '🗑️ VRChat のグループのイベントから今週の集会を削除しました。';
  } catch (error) {
    console.error('deleteVrcEvent failed:', error);
    return `❌ VRChat のグループのイベントを削除できませんでした: ${error instanceof Error ? error.message : String(error)}\n`
      + 'VRChat のグループの「イベント」から手で削除してください。';
  }
}
