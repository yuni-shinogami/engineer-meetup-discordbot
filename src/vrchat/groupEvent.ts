import { createGroupCalendarEvent, deleteGroupCalendarEvent } from './api/calendar';
import { env } from './internal/util';
import { withSession } from './session';

export interface MeetupEventInput {
  title: string;
  description: string;
  /** ISO 8601（タイムゾーン付き） */
  startsAt: string;
  endsAt: string;
}

/** 作ったイベントを後から消すための控え。 */
export interface MeetupEventRef {
  groupId: string;
  eventId: string;
}

/**
 * VRChat のグループのカレンダーに集会のイベントを作る（VRChat の「イベント」に載る）。
 * 本番は公開（グループ外の人にもイベント一覧で見える）。テストはテスト用のグループに、グループ内だけで作る。
 * 作成時の通知は送らない（当日の開催告知のグループ投稿で通知が飛ぶため）。
 */
export async function createMeetupEvent(isProd: boolean, input: MeetupEventInput): Promise<MeetupEventRef> {
  const groupId = isProd ? env('GROUP_ID') : env('TEST_GROUP_ID');
  return withSession(async ({ client }) => {
    const { id } = await createGroupCalendarEvent(client, groupId, {
      ...input,
      category: 'hangout',
      accessType: isProd ? 'public' : 'group',
      sendCreationNotification: false,
      isDraft: false,
      platforms: ['standalonewindows', 'android'],
      languages: ['jpn'],
    });
    console.log(`[groupEvent] created ${id} in ${groupId}`);
    return { groupId, eventId: id };
  });
}

export async function deleteMeetupEvent(ref: MeetupEventRef): Promise<void> {
  await withSession(({ client }) => deleteGroupCalendarEvent(client, ref.groupId, ref.eventId));
  console.log(`[groupEvent] deleted ${ref.eventId} in ${ref.groupId}`);
}
