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

6. **設定確認 (`/status`, `/check-permissions`)**
   - `/status`: 今週のスケジュール状況、X/VRChat 連携設定、Bot が参照する各チャンネルの疎通、自動実行スケジュールの次回実行時刻を確認します。
   - `/check-permissions`: Bot が各チャンネルで必要な権限（閲覧・送信・リンク埋め込み・ロールping）を持っているか確認します。

7. **権限制御**
   - 全コマンドは `OPERATOR_ROLE_ID` で指定したロールを持つユーザーのみ実行可能です。

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
    storage.ts        状態の永続化（storage.json）
    executor.ts       外部スクリプト実行ユーティリティ
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
