# Engineer Meetup Discord Bot

エンジニア集会の運営をサポートするための Discord Bot です。
毎週の開催確認・事前告知・インスタンス起動・SNS 告知を半自動化します。
また、LT（ライトニングトーク）の告知画像を生成する機能を持ちます。

## 主な機能

1. **開催確認 (毎週木曜 12:00 自動 / `/confirm-meetup` で手動)**
   - 運営チャンネルに「今週やる？」の YES/NO ボタンを送信します。
   - YES が押されると、その週の事前告知が予約されます（`storage.json` に保存）。

2. **事前告知 (毎週木曜 19:00 自動 / `/pre-announce` で手動)**
   - 開催予約済みの場合、X（Twitter）に事前告知ツイート（画像付き）を投稿します。
   - 投稿したツイート ID を `storage.json` に保存し、`/post-announcement` の引用リポストで使用します。

3. **インスタンス起動 (`/create-instance`)**
   - VRChat にログインし、Group+ インスタンスを作成、自分とサブアカウントを招待します。
   - 招待 URL を取得し `storage.json` に保存します（告知は行いません）。

4. **開催告知 (`/post-announcement`)**
   - X への引用リポスト・Discord のお知らせチャンネルへの投稿・VRChat グループ告知（掲示板投稿）を一括実行します。
   - `/pre-announce` を先に実行していないと X 告知はスキップされます。`/create-instance` を先に実行していないとコマンド自体が失敗します。

5. **LT 告知画像生成 (`/generate-lt-image`)**
   - タイトル・スピーカー名・開催月日・アイコン画像・タイトルスライド画像を受け取り、PNG 画像を生成して返信します。

6. **LT 応募受付 (`/lt-apply`)**
   - モーダルで応募内容を受け取り、LT フォーラムにポストを自動作成、`受付中` タグを付けて運営チャンネルへ通知します。
   - 作成されたフォーラムポストが、そのまま応募1件のレコード兼・登壇者との連絡窓口になります。
   - ポスト内のセレクトで登壇者が発表希望日（候補は `MEETUP_WEEKDAY` から自動算出）と動画再生の予定を回答します。
   - 応募は登壇者本人が行うため、このコマンドだけは `OPERATOR_ROLE_ID` を要求しません。

7. **設定確認 (`/status`, `/check-permissions`)**
   - `/status`: 今週のスケジュール状況、X/VRChat 連携設定、Bot が参照する各チャンネルの疎通、自動実行スケジュールの次回実行時刻を確認します。
   - `/check-permissions`: Bot が各チャンネルで必要な権限（閲覧・送信・リンク埋め込み・ロールping）を持っているか確認します。

8. **権限制御**
   - `/lt-apply` を除く全コマンドは `OPERATOR_ROLE_ID` で指定したロールを持つユーザーのみ実行可能です。

## LT 応募ワークフロー

LT の応募は「応募 → 日程調整 → 素材回収 → 告知」を1本のステートマシンとして扱います。
**フォーラムポスト1つ＝応募1件**で、スレッド ID がレコードの主キーです。
ステータスはフォーラムのタグとして表示されますが、**正はあくまでレコード側**で、Bot はレコード → タグの一方向にのみ同期します。

| 内部キー | フォーラムのタグ名 | 意味 |
| :--- | :--- | :--- |
| `applied` | 受付中 | 応募受付済み・日程未定 |
| `scheduled` | 日程確定 | 運営が日程を承認済み |
| `ready` | 準備完了 | 素材がそろい告知画像を生成済み |
| `announced` | 告知済み | LT 告知を投稿済み |
| `done` | 登壇完了 | 登壇が終わった |
| `cancelled` | 取り下げ | 応募が取り下げられた |

### フォーラムのタイトル

タイトルは **「日付 登壇者名」**（例: `8/14 ゆに`）で、レコードの変化に追従して自動更新されます。

| 状態 | タイトル |
| :--- | :--- |
| 応募直後（希望日未選択） | `日程未定 ゆに` |
| 希望日を選択（複数なら最も早い日） | `8/14 ゆに` |
| 運営が日程を確定 | 確定日で更新 |

希望日か確定日かはフォーラムのタグ（`受付中` / `日程確定`）で判別できるため、タイトルには含めていません。
LT のタイトルはポストの埋め込みに表示されます。

なお **スレッド名の変更は Discord 側で 10 分あたり 2 回に制限** されています。
`syncLtThreadName` は名前が変わらないときは API を呼ばず、失敗しても応募処理自体は止めません
（希望日を短時間に何度も選び直すと、タイトルの反映だけが遅れることがあります）。

### 応募モーダルの設問

Discord のモーダルは **コンポーネント 5 個まで**（API 仕様）という制約があるため、
従来の Google フォームの設問を次のように再構成しています。

| モーダルの設問 | 型 | 元フォームの設問 |
| :--- | :--- | :--- |
| 発表者の名前 | テキスト | 発表者の名前（Discord 表示名を初期値に設定） |
| 発表テーマ・タイトル | テキスト | 発表テーマ・タイトル（「未定」可） |
| LTの所要時間（分） | テキスト | LT の所要時間 |
| 参加者による撮影・SNS拡散 | セレクト（2択） | 写真撮影/SNS拡散の可否 |
| 集会YouTubeチャンネルへの録画公開 | セレクト（3択） | 撮影動画の公開可否 |

- **発表者の Discord ユーザー名**は設問から削除しました。`interaction.user.id` から確実に取得できるため、
  名寄せが不要になり、以降のメンション・催促・本人限定操作がすべて ID ベースで動きます。
モーダルの 5 枠に収まらない次の 2 つは、作成されたフォーラムポスト内のセレクトで受け取ります。

| ポスト内の設問 | 内容 |
| :--- | :--- |
| 発表希望日（複数選択可） | 候補日は Bot が算出して提示するので、開催日を問い合わせる必要はありません。「**この中に登壇できる日がない**」も常に選べます（後述） |
| LTの中で動画を流す予定はありますか？ | ワールド側の準備要否に関わるため。日程確定後も変更できます |

`videoPlayback` は未回答を `null` で保持します。`false`（動画なし）に倒すと未回答と区別できず、
ワールド準備の確認漏れにつながるためです。ポストの埋め込みには「❔ 未回答」と表示されます。
### 撮影・拡散と録画公開の許諾

この 2 つは **行為者が違う別の許諾** です。混同しないよう、レコードでも独立したフィールドで保持しています。

| フィールド | 何の許諾か | 値 | 使いどころ |
| :--- | :--- | :--- | :--- |
| `capturePolicy` | **参加者**がスライドを写真撮影し SNS で拡散してよいか | `allowed` / `denied` | 当日アナウンス、告知文の注記 |
| `archivePolicy` | **運営**が録画を集会 YouTube チャンネルに公開してよいか | `public` / `unlisted` / `none` | 登壇後のアーカイブ作業 |

`unlisted` は「YouTube の限定公開にして URL を集会 Discord 内でのみ共有する」運用を指します。

「参加者に撮られるのは困るが、公式アーカイブなら可」は矛盾しないため、**2 × 3 = 6 通りすべてが有効**です。
1 問に統合すると選択肢が 6 個になり読みづらいので、モーダルでは 2 問（2択 + 3択）に分けています
（`src/discordbot/lt/types.ts` の `CAPTURE_POLICY_CHOICES` / `ARCHIVE_POLICY_CHOICES`）。
その 2 枠を確保するため、「LTの中で動画を流す予定」をポスト側に移しています。

フォーラムポストでは次の場合に警告を表示します。

- `capturePolicy` が `denied` → 当日アナウンスでの周知を促す
- `archivePolicy` が `public` 以外 → アーカイブ時の制限を明示
- `videoPlayback` が `true` → ワールド側の準備確認を促す

### 候補日が合わない場合

1 集会あたりの LT 枠は既定で 1 枠（`LT_SLOTS_PER_DAY`）です。候補日は `LT_DATE_CANDIDATES` 回分（既定 8 回＝約2か月先まで）を提示し、
埋まっている日も「埋まっています（運営と要相談）」として選択肢には残します。**選択肢が 0 件になると Discord がセレクト自体を拒否する**ため、除外はしません。

どの候補日も都合が合わない場合の導線として、セレクトには常に「この中に登壇できる日がない」が入っています。
これを選ぶと希望時期を書くモーダルが開き、内容は `LtEntry.scheduleNote` に保存されたうえで、
**その応募のフォーラムポスト内に投稿** されます（`OPERATOR_ROLE_ID` をメンション）。
運営チャンネルには送りません。日程のやり取りは応募ポストに集約したほうが、後から経緯を追えるためです。
候補日がすべて埋まっている状態で応募された場合は、ポスト作成時の案内文も自動でこの導線を促す文面に切り替わります。

候補日と「登壇できる日がない」は同時に選べます（「基本はこの日だけど他も相談したい」を表現できます）。

### ステータスとタグ

タグ名は `src/discordbot/lt/status.ts` の `LT_STATUS_LABELS` で管理しています。
Discord 側のタグ名を変える場合はこの定数も合わせて変更してください。絵文字はタグの `name` とは別フィールドなので、タグに絵文字を付けても名前の引き当てには影響しません。

**事前準備**: LT フォーラムに上記6つのタグを手動で作成してください。タグに「モデレーターのみ設定可」を付けると登壇者による付け替えを防げます（この場合 Bot に `ManageThreads` 権限が必要）。設定漏れは起動時のログと `/status` で確認できます。

LT 告知は週次の事前告知・開催告知とは分離した独立の投稿として扱います（Phase 4 で実装予定）。

`/confirm-meetup`・`/pre-announce`・`/create-instance`・`/post-announcement` には `production` オプション（Boolean、デフォルト `False`）があり、`False`（テストモード）ではテスト用アカウント・テストチャンネル・テスト用 VRChat グループを使用します。**`/pre-announce` と `/post-announcement` は同じ `production` 値で実行してください**（片方が本番・もう片方がテストだと、X 側の「引用元の投稿に自分がメンションされていない」制限に引っかかり引用リポストが 403 で失敗します）。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境設定

`.env.example` を `.env` にコピーし、値を埋めてください。

| 変数名 | 説明 |
| :--- | :--- |
| `DISCORD_TOKEN` | Discord Bot のトークン |
| `GUILD_ID` | Bot を導入するサーバーの ID |
| `OPERATIONS_CHANNEL_ID` | 運営用チャンネル ID（開催確認・エラー通知） |
| `PUBLIC_CHANNEL_ID` | 本番お知らせチャンネル ID |
| `TEST_CHANNEL_ID` | テスト用チャンネル ID（テストモード時に使用） |
| `ANNOUNCE_ROLE_ID` | 告知メッセージでメンションするロールの ID |
| `OPERATOR_ROLE_ID` | コマンド実行を許可するロールの ID |
| `X_ACCOUNT` / `TEST_X_ACCOUNT` | 本番／テスト用 X アカウントのユーザー名（投稿URL組み立てに使用） |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` | 本番 X アカウントの API 資格情報 |
| `TEST_X_API_KEY` / `TEST_X_API_SECRET` / `TEST_X_ACCESS_TOKEN` / `TEST_X_ACCESS_SECRET` | テスト用 X アカウントの API 資格情報 |
| `USER_AGENT` | VRChat API 規約で必須。形式: `AppName/1.0 contact@example.com` |
| `VRC_STATE_DIR` | VRChat セッション（cookie）・インスタンス情報の保存先ディレクトリ |
| `VRC_MAIN_USERNAME` / `VRC_MAIN_PASSWORD` | VRChat ログイン用アカウント |
| `VRC_MAIN_TOTP_SECRET` | 2FA が有効な場合の TOTP シークレット（任意） |
| `VRC_SUB_USER_ID` | インスタンス作成時に自動招待するサブアカウントのユーザーID |
| `WORLD_ID` | インスタンスを作成するワールドの ID |
| `GROUP_ID` / `TEST_GROUP_ID` | 本番／テスト用の VRChat グループ ID |
| `INSTANCE_REGION` | インスタンスのリージョン（任意、デフォルト `jp`） |
| `CONFIRM_CRON` / `PRE_ANNOUNCE_CRON` | 自動実行の cron 式（任意、デフォルトは毎週木曜 12:00 / 19:00） |
| `STORAGE_PATH` | 状態保存ファイルのパス（デフォルト: `./storage.json`） |
| `LT_FORUM_CHANNEL_ID` / `TEST_LT_FORUM_CHANNEL_ID` | 本番／テスト用の LT 応募フォーラムチャンネル ID |
| `MEETUP_WEEKDAY` | 集会の開催曜日（0=日 … 5=金、任意、デフォルト `5`） |
| `LT_SLOTS_PER_DAY` | 1回の集会あたりの LT 枠数（任意、デフォルト `1`） |
| `LT_DATE_CANDIDATES` | 日程選択で提示する候補の開催回数（任意、デフォルト `8`） |
| `LT_STORE_PATH` | LT レコードの保存先（任意、デフォルト `./lt-store.json`） |
| `LT_MATERIALS_DIR` | LT 素材の保存先ディレクトリ（任意、デフォルト `./state/lt-materials`） |

`CONFIRM_CRON` / `PRE_ANNOUNCE_CRON` の木曜は**開催前日**の確認・事前告知であり、開催日そのものではありません。LT の日程候補は cron 式ではなく `MEETUP_WEEKDAY` から算出します。

`CLIENT_ID` は Bot ログイン時に自動取得されるため設定不要です。

### 3. ビルドと起動

#### 開発モード

```bash
npm start
```

#### 本番モード（PM2）

```bash
# 初回セットアップ
npm install -g pm2
npm run build
pm2 start dist/discordbot/index.js --name engineer-meetup-bot
pm2 save
pm2 startup  # 出力されたコマンドを実行するとサーバー再起動後も自動起動

# コード変更後のデプロイ（ビルド + pm2 再起動）
npm run deploy
```

## コマンド一覧

| コマンド | 説明 |
| :--- | :--- |
| `/confirm-meetup` | 今週の開催確認 YES/NO ボタンを運営チャンネルに送信 |
| `/pre-announce` | X に事前告知（画像付き）を投稿 |
| `/create-instance` | VRChat インスタンスを作成し招待 URL を取得 |
| `/post-announcement` | X 引用リポスト・Discord・VRCGroup への告知を一括実行 |
| `/status` | Bot の設定状態と今週のスケジュール状況を確認 |
| `/check-permissions` | Bot が各チャンネルで必要な権限を持っているか確認 |
| `/generate-lt-image` | LT 告知画像を生成して返信 |
| `/lt-apply` | LT に応募（モーダル入力 → フォーラムポスト自動作成） |

### `/generate-lt-image` のオプション

| オプション | 型 | 説明 |
| :--- | :--- | :--- |
| `title` | 文字列 | LT タイトル |
| `speaker-name` | 文字列 | スピーカー名 |
| `month` | 整数 (1-12) | 開催月 |
| `day` | 整数 (1-31) | 開催日 |
| `speaker-icon` | 添付ファイル | スピーカーアイコン画像 |
| `title-slide` | 添付ファイル | タイトルスライド画像 |

## ディレクトリ構造

```
src/
  discordbot/
    index.ts        エントリーポイント、イベントハンドラ登録
    config.ts        環境変数の読み込み
    scheduler.ts      定期実行タスク（木曜 confirm / pre-announce）
    meetup.ts         開催確認・事前告知の実行ロジック
    storage.ts        週次状態の永続化（storage.json）
    interactions.ts   customId のルーティング（ボタン・モーダル・セレクト）
    handlers.ts       ハンドラと customId キーの紐づけ
    executor.ts       外部スクリプト実行ユーティリティ
    lt/
      types.ts        LtEntry / LtStatus の定義
      status.ts       ステータスとフォーラムタグ名の対応・タグ ID 解決
      store.ts        LT レコードの永続化（lt-store.json、原子的書き込み）
      dates.ts        開催日候補の算出と日付整形
      forum.ts        フォーラムポストの作成・タグ同期・ポスト内コンポーネント
      guard.ts        ポスト内コンポーネント操作の共通検証（本人確認など）
    commands/          各スラッシュコマンドの定義とハンドラ
  x/
    xBot.ts           X (Twitter) API クライアント
    postAnnouncement.ts  事前告知ツイートの投稿
    quotePost.ts      開催告知の引用リポスト
    assets/           投稿テンプレート・画像
  vrchat/
    api/              VRChat API クライアント（認証・インスタンス作成・投稿）
    actions/          VRChat 上のアクション（グループ投稿・招待）
    createInstance.ts     インスタンス作成フロー
    postGroupAnnouncement.ts  グループ掲示板への告知フロー
    assets/           グループ投稿テンプレート
  image-gen/
    generate.ts       画像生成エントリーポイント
    fonts.ts          フォント読み込み
    templates/
      lt-announce.tsx     LT 告知画像テンプレート
    assets/
      images/             テンプレートで使用する画像素材
assets/
  fonts/              フォントキャッシュ（自動生成、.gitignore 対象）
```

## テスト

```bash
npm test
```

[Vitest](https://vitest.dev/) を使用しています。Discord・X・VRChat の各 API 呼び出しはモックし、
テンプレート置換や環境変数バリデーション、状態遷移などのロジックを検証しています。
`src/image-gen/__tests__/generate.test.ts` は画像生成結果をスナップショット（PNG）と比較します。
スナップショットを更新する場合は `UPDATE_SNAPSHOTS=1 npm test` を実行してください。
