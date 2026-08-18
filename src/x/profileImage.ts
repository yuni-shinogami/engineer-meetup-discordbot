import { createXClient } from './xBot';

/**
 * X が返すプロフィール画像 URL は 48×48 の `_normal` 版。
 * 告知画像には小さすぎるので、同じ命名規則の 400×400 版に差し替える。
 */
export function upgradeProfileImageUrl(url: string): string {
  return url.replace(/_normal(\.\w+)(\?.*)?$/, '_400x400$1$2');
}

/**
 * X のプロフィール画像 URL を引く。
 *
 * ユーザー検索は X API のプランによっては利用できないため、**失敗しても例外にせず null を返す**。
 * 呼び出し元はアイコン画像を直接送ってもらうフォールバックに倒すこと。
 */
export async function fetchXProfileImageUrl(
  username: string,
  isProd: boolean,
): Promise<string | null> {
  try {
    const client = createXClient(isProd);
    const result = await client.v2.userByUsername(username, {
      'user.fields': ['profile_image_url'],
    });

    const url = result.data?.profile_image_url;
    if (!url) {
      console.warn(`[X] @${username} のプロフィール画像 URL を取得できませんでした`);
      return null;
    }
    return upgradeProfileImageUrl(url);
  } catch (error) {
    console.warn(
      `[X] @${username} のプロフィール取得に失敗しました:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
