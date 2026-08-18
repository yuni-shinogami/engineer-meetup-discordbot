import { join } from 'path';
import { env } from './internal/util';
import { createClient } from './api/client';
import { validateUserAgent, login, AuthError } from './api/auth';
import { createGroupPost } from './api/post';
import { GROUP_POST_VISIBILITY } from './constants';
export { AuthError };

export interface LtGroupPostOptions {
  isProd: boolean;
  stateDir: string;
  title: string;
  body: string;
  /** メンバー全員に通知を飛ばすか（呼び出し側の `LT_GROUP_POST_NOTIFY`） */
  sendNotification: boolean;
}

/**
 * LT 告知をグループ掲示板に投稿する。
 *
 * 週次の `postGroupAnnouncement` はインスタンス情報（`state/latest.json`）を前提にするが、
 * LT 告知はインスタンスと無関係に出すため、本文を丸ごと受け取る別の入口にしている。
 * 返り値は投稿 ID で、再投稿を防ぐ冪等キーとしてレコードに残す。
 */
export async function postLtGroupAnnouncement(options: LtGroupPostOptions): Promise<string> {
  const { isProd, stateDir, title, body, sendNotification } = options;

  const userAgent = env('USER_AGENT');
  validateUserAgent(userAgent);

  const client = await createClient(userAgent, join(stateDir, 'cookies.json'));
  await login(
    client,
    env('VRC_MAIN_USERNAME'),
    env('VRC_MAIN_PASSWORD'),
    env('VRC_MAIN_TOTP_SECRET', { required: false }) || null,
  );

  const groupId = isProd ? env('GROUP_ID') : env('TEST_GROUP_ID');
  const post = await createGroupPost(
    client, groupId, title, body, GROUP_POST_VISIBILITY, sendNotification,
  );

  const id = typeof post['id'] === 'string' ? post['id'] : '';
  console.log(`[LT] グループ掲示板に投稿しました: id=${id} group=${groupId}`);
  return id;
}
