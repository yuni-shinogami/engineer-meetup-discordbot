import { join } from 'path';
import dotenv from 'dotenv';
dotenv.config();

function intEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  guildId: process.env.GUILD_ID || '',
  operationsChannelId: process.env.OPERATIONS_CHANNEL_ID || '',
  publicChannelId: process.env.PUBLIC_CHANNEL_ID || '',
  testChannelId: process.env.TEST_CHANNEL_ID || '',
  announceRoleId: process.env.ANNOUNCE_ROLE_ID || '',
  operatorRoleId: process.env.OPERATOR_ROLE_ID || '',
  xAccount: process.env.X_ACCOUNT || '',
  testXAccount: process.env.TEST_X_ACCOUNT || '',
  vrcStateDir: process.env.VRC_STATE_DIR || '',
  /** 週次の開催状態。実行時に書き換わるデータは state/ にまとめる。 */
  storagePath: process.env.STORAGE_PATH || './state/storage.json',
  /**
   * Discord ユーザー → VRChat ユーザーID の対応表。
   * cookie やインスタンス情報と同じ VRChat 側の状態なので、既定では VRC_STATE_DIR に置く。
   * 個人に紐づくデータなので Git には載せない。
   */
  vrcLinkStorePath: process.env.VRC_LINK_STORE_PATH
    || join(process.env.VRC_STATE_DIR || './state', 'vrc-links.json'),

  // --- LT (ライトニングトーク) ---
  ltForumChannelId: process.env.LT_FORUM_CHANNEL_ID || '',
  testLtForumChannelId: process.env.TEST_LT_FORUM_CHANNEL_ID || '',
  ltStorePath: process.env.LT_STORE_PATH || './state/lt-store.json',
  ltMaterialsDir: process.env.LT_MATERIALS_DIR || './state/lt-materials',
  /** 集会の開催曜日（0=日 ... 5=金 ... 6=土） */
  meetupWeekday: intEnv('MEETUP_WEEKDAY', 5),
  /** 1回の集会あたりの LT 枠数（原則 1 枠） */
  ltSlotsPerDay: intEnv('LT_SLOTS_PER_DAY', 1),
  /** 日程選択で提示する候補の開催回数 */
  ltDateCandidates: intEnv('LT_DATE_CANDIDATES', 8),
  /**
   * 素材として受け付ける画像 1 枚あたりの上限（MB）。
   * Discord が添付を通した画像は基本的に受けたいので、Nitro Basic / ブーストレベル2 の
   * 添付上限に合わせて 50MB を既定にしている。サーバーの上限に合わせて調整する。
   */
  ltMaxMaterialMb: intEnv('LT_MAX_MATERIAL_MB', 50),
  /**
   * LT 告知でメンションするロール。未設定なら週次告知と同じ ANNOUNCE_ROLE_ID を使う
   * （実運用でも LT の告知は同じ「お知らせping」を飛ばしている）。
   * LT だけ別のロールに向けたい場合にここを設定する。
   */
  ltAnnounceRoleId: process.env.LT_ANNOUNCE_ROLE_ID || '',
  /**
   * VRChat グループ掲示板への LT 告知でメンバー全員に通知を飛ばすか。
   * インスタンス告知（GROUP_POST_SEND_NOTIFICATION）と揃えて既定は true。
   * 掲示板に載るだけでは気づかれないため、通知を飛ばさないと告知の意味が薄い。
   */
  ltGroupPostNotify: boolEnv('LT_GROUP_POST_NOTIFY', true),
  /**
   * 週次フロー（木曜の事前告知・当日の開催告知）に LT 告知を同乗させるか。
   * 普段の運用に合わせて既定は true。告知はポストのボタンから手動でも出せるので、
   * 自動化だけを止めたいときに false にする。
   */
  ltAutoAnnounce: boolEnv('LT_AUTO_ANNOUNCE', true),

  // --- Canva（司会進行スライドの PDF 配布） ---
  canvaClientId: process.env.CANVA_CLIENT_ID || '',
  canvaClientSecret: process.env.CANVA_CLIENT_SECRET || '',
  /** 司会進行スライドのデザイン ID。Canva の編集 URL /design/<ここ>/edit */
  canvaSlideDesignId: process.env.CANVA_SLIDE_DESIGN_ID || '',
  /** 初回認可のコールバック先。Developer Portal に登録した値と一致していないと弾かれる。 */
  canvaRedirectUri: process.env.CANVA_REDIRECT_URI || 'http://127.0.0.1:8976/callback',
  /** リフレッシュトークンの置き場所。VRChat の cookies.json と同じ state ディレクトリ。 */
  canvaStateDir: process.env.CANVA_STATE_DIR || './state',
  /**
   * 添付できる PDF の上限（MB）。超えたら投稿せずサイズを知らせる。
   * LT 素材（LT_MAX_MATERIAL_MB）と同じサーバーの添付上限に合わせて 50MB を既定にしている。
   */
  canvaMaxPdfMb: intEnv('CANVA_MAX_PDF_MB', 50),
  /**
   * 開催確認で「開催する」を選んだときに、司会進行スライドを自動投稿するか。
   * 事前告知（木19時）ではなく開催確認（木12時）に寄せているのは、
   * 司会が当日までに中身を確認する時間を取るため。
   */
  canvaAutoPostSlides: boolEnv('CANVA_AUTO_POST_SLIDES', true),
  /**
   * 司会進行スライド動画の 1 ページあたりの表示秒数。
   * VRChat の動画プレイヤーでシークしてページを送る使い方なので、既定は 1 秒。
   */
  slidesVideoSeconds: intEnv('SLIDES_VIDEO_SECONDS', 1),
  /** 司会進行スライド動画の高さ(px)。横幅は PDF の縦横比から決まる。 */
  slidesVideoHeight: intEnv('SLIDES_VIDEO_HEIGHT', 1080),
};

export function ltForumChannelId(isProd: boolean): string {
  return isProd ? config.ltForumChannelId : config.testLtForumChannelId;
}

/** LT 告知でメンションするロール。専用の指定が無ければ週次告知と同じロールに送る。 */
export function ltAnnounceRoleId(): string {
  return config.ltAnnounceRoleId || config.announceRoleId;
}
