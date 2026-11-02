import { VRChatClient } from './client';

/** グループのカレンダーのイベント。項目は VRChat API の CreateCalendarEventRequest。 */
export interface CalendarEventRequest {
  title: string;
  description: string;
  /** UTC の ISO 8601（`2026-11-06T13:00:00.000Z`）。オフセット付き（`+09:00`）は 400 で弾かれる */
  startsAt: string;
  endsAt: string;
  category: 'hangout' | 'education' | 'other';
  /** public は VRChat のイベント一覧（Discover）でグループ外の人にも見える */
  accessType: 'public' | 'group';
  sendCreationNotification: boolean;
  /** 指定しないと下書き（true）で作られ、公開されない */
  isDraft: boolean;
  platforms?: ('standalonewindows' | 'android' | 'ios')[];
  languages?: string[];
}

export async function createGroupCalendarEvent(
  client: VRChatClient,
  groupId: string,
  event: CalendarEventRequest,
): Promise<{ id: string }> {
  const resp = await client.http.post(`/calendar/${groupId}/event`, event);
  const id = (resp.data as { id?: unknown } | undefined)?.id;
  if ((resp.status !== 200 && resp.status !== 201) || typeof id !== 'string') {
    throw new Error(`グループのイベントの作成に失敗 (${resp.status}): ${JSON.stringify(resp.data)}`);
  }
  return { id };
}

export async function deleteGroupCalendarEvent(client: VRChatClient, groupId: string, calendarId: string): Promise<void> {
  const resp = await client.http.delete(`/calendar/${groupId}/${calendarId}`);
  // すでに消えていれば、消したかった状態にはなっている
  if (resp.status !== 200 && resp.status !== 204 && resp.status !== 404) {
    throw new Error(`グループのイベントの削除に失敗 (${resp.status}): ${JSON.stringify(resp.data)}`);
  }
}
