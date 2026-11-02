import { storage } from './storage';
import { ltEntriesForMeetup, nextMeetupDate } from './lt/weekly-announce';
import { MEETUP_END_TIME, MEETUP_START_TIME, vrceveFields } from './vrceve';
import { createMeetupEvent, deleteMeetupEvent } from '../vrchat/groupEvent';

/**
 * VRChat のグループのイベント（VRChat の「イベント」に載るカレンダー）への登録。
 * 開催確認で YES になったら作り、取りやめたら消す。タイトル・内容・時刻は VRChat イベントカレンダー（vrceve）と共通。
 */

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
      // 集会は日本時間
      startsAt: `${eventDate}T${MEETUP_START_TIME}:00+09:00`,
      endsAt: `${eventDate}T${MEETUP_END_TIME}:00+09:00`,
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
