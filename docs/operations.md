# 運用

## 状態ファイルの置き場所

実行時に書き換わるデータは、すべて **`state/`** にまとめています（`state/` は `.gitignore` 済み）。
バックアップや別マシンへの移設は、このディレクトリごと運べば済みます。

| ファイル | 内容 | 環境変数 |
| :--- | :--- | :--- |
| `state/storage.json` | 週次の開催予定・直近のツイートID・招待URL | `STORAGE_PATH` |
| `state/lt-store.json` | LT 応募レコード | `LT_STORE_PATH` |
| `state/lt-materials/` | LT 告知の素材画像 | `LT_MATERIALS_DIR` |
| `state/latest.json` | 直近に作成したインスタンス情報 | `VRC_STATE_DIR` |
| `state/vrc-links.json` | Discord ↔ VRChat アカウント対応表 | `VRC_LINK_STORE_PATH` |
| `state/activity/` | サーバーのアクティビティの日別・ユーザー別集計と、ユーザー名の対応表（`users.json`） | `ACTIVITY_DIR` |

`VRC_STATE_DIR` 以外は**プロセスの cwd 相対**です。本番の systemd サービスはリポジトリを cwd にして起動するので
通常は意識不要ですが、別のディレクトリから `npm start` すると別の場所を見にいきます。

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
| `VRC_GATEWAY_URL` / `VRC_GATEWAY_TOKEN` | vrchat-gateway の URL と、ゲートウェイが発行した Bot 用のトークン（下の「VRChat へのログイン」） |
| `VRC_STATE_DIR` | インスタンス情報の保存先ディレクトリ。未設定なら VRChat への告知などを飛ばす |
| `VRC_SUB_USER_ID` | インスタンス作成時に自動招待するサブアカウントのユーザーID |
| `WORLD_ID` | インスタンスを作成するワールドの ID |
| `GROUP_ID` / `TEST_GROUP_ID` | 本番／テスト用の VRChat グループ ID |
| `INSTANCE_REGION` | インスタンスのリージョン（任意、デフォルト `jp`） |
| `VRC_LAUNCHER_SSH_TARGET` / `VRC_LAUNCHER_SSH_KEY` | 「サブアカウントで入る」ボタンで VRChat を起動する PC の SSH 接続先（`ユーザー名@ホスト`）と秘密鍵のパス（任意、両方そろったときだけボタンを出す）。接続先ではこの鍵を `authorized_keys` の `command=` で起動スクリプトに固定し、Bot からは location だけを送る |
| `LT_RECORDER_SSH_KEY` / `LT_RECORDER_SSH_TARGET` | 「LT録画開始」ボタンで録画する PC の秘密鍵のパスと SSH 接続先（任意。接続先の既定は `VRC_LAUNCHER_SSH_TARGET`、鍵があるときだけボタンを出す）。入室用とは別の鍵にし、接続先ではこの鍵を `authorized_keys` の `command=` で録画スクリプトに固定する |
| `VRCEVE_SSH_KEY` / `VRCEVE_SSH_TARGET` | VRChat イベントカレンダーに登録するデスクトップ VM の秘密鍵のパスと SSH 接続先（任意。両方そろっているときだけ、開催確認の YES で登録し、NO で削除する）。接続先ではこの鍵を `authorized_keys` の `command=` で `browser-desktop/vrceve/request.sh` に固定する |
| `VRC_LINK_STORE_PATH` | Discord ↔ VRChat アカウント対応表の保存先（任意、デフォルトは `VRC_STATE_DIR/vrc-links.json`） |
| `CONFIRM_CRON` / `PRE_ANNOUNCE_CRON` | 自動実行の cron 式（任意、デフォルトは毎週月曜 12:00 / 木曜 19:00） |
| `STORAGE_PATH` | 週次状態の保存先（任意、デフォルト `./state/storage.json`） |
| `LT_FORUM_CHANNEL_ID` / `TEST_LT_FORUM_CHANNEL_ID` | 本番／テスト用の LT 応募フォーラムチャンネル ID |
| `MEETUP_WEEKDAY` | 集会の開催曜日（0=日 … 5=金、任意、デフォルト `5`） |
| `LT_SLOTS_PER_DAY` | 1回の集会あたりの LT 枠数（任意、デフォルト `1`） |
| `LT_DATE_CANDIDATES` | 日程選択で提示する候補の開催回数（任意、デフォルト `8`） |
| `LT_STORE_PATH` | LT レコードの保存先（任意、デフォルト `./state/lt-store.json`） |
| `LT_MATERIALS_DIR` | LT 素材の保存先ディレクトリ（任意、デフォルト `./state/lt-materials`） |
| `LT_MAX_MATERIAL_MB` | 素材画像1枚あたりの上限MB（任意、デフォルト `50`） |
| `LT_ANNOUNCE_ROLE_ID` | LT 告知でメンションするロール ID（任意、未設定なら `ANNOUNCE_ROLE_ID` と同じロール） |
| `LT_GROUP_POST_NOTIFY` | VRChat グループ告知でメンバー全員に通知するか（任意、デフォルト `true`） |
| `LT_AUTO_ANNOUNCE` | 週次フローに LT 告知を同乗させるか（任意、デフォルト `true`） |
| `ACTIVITY_DIR` | アクティビティ集計の保存先ディレクトリ（任意、デフォルト `./state/activity`） |
| `ACTIVITY_MEMBER_EVENTS` | 参加・退出も数えるか（任意、デフォルト `false`。Server Members Intent を有効にしてから `true` にする） |

`PRE_ANNOUNCE_CRON` の木曜は**開催前日**の事前告知であり、開催日そのものではありません。LT の日程候補は cron 式ではなく `MEETUP_WEEKDAY` から算出します。

`CLIENT_ID` は Bot ログイン時に自動取得されるため設定不要です。

### 3. ビルドと起動

#### 開発モード

```bash
npm start
```

#### 本番モード（systemd）

本番は Proxmox 上の LXC コンテナ `engineer-meetup-bot`（Debian 13、この Bot 専用）で、systemd サービス `engineer-meetup-bot` として動かしています。
専用ユーザー `engineer-meetup` で `/home/engineer-meetup/app` から起動し、落ちても 10 秒後に自動で再起動します。
書き込めるのは `state/` とフォントキャッシュ（`assets/fonts/`）だけです。

**`main` にマージすれば、1 分以内に自動でデプロイされます。** 手作業は要りません。

本番のタイマー `engineer-meetup-deploy.timer` が 1 分ごとに `deploy/auto-deploy.sh` を実行し、
`origin/main` に新しいコミットがあれば `deploy/deploy.sh` でデプロイします。
コンテナから GitHub を見にいく方式なので、GitHub Actions も、外からコンテナに入る経路も使いません。

`deploy/deploy.sh` は `git pull` → `npm ci` → `npm run build` → サービス再起動を行い、
Discord へのログイン（`Ready! Logged in`）をログで確認できたら完了とします。30 秒以内に確認できなければ失敗です。

**デプロイに失敗したとき**は、直前のコミットに自動で戻し、運営チャンネルに Bot から知らせます。
失敗したコミットは、`main` に次のコミットが入るまで再試行しません。修正を `main` にマージすれば、それが改めてデプロイされます。

手動でデプロイしたいとき（自動デプロイを止めているときなど）は、次を実行します。

```bash
ssh engineer-meetup-bot /home/engineer-meetup/app/deploy/deploy.sh
```

| 操作 | コマンド（コンテナ上で root） |
| :--- | :--- |
| 自動デプロイのログ | `journalctl -u engineer-meetup-deploy` |
| 自動デプロイを止める／再開する | `systemctl disable --now engineer-meetup-deploy.timer` ／ `systemctl enable --now engineer-meetup-deploy.timer` |
| `.env` だけ変えたときの再起動 | `systemctl restart engineer-meetup-bot` |
| 停止 | `systemctl stop engineer-meetup-bot` |
| 状態の確認 | `systemctl status engineer-meetup-bot` |
| ログの追従 | `journalctl -u engineer-meetup-bot -f` |

**Bot を動かすのは本番の 1 か所だけにしてください。** 別のマシンや `npm start`（ts-node での直接起動）と併用すると Bot が二重に動き、
同じスラッシュコマンドを取り合って**古いコードのプロセスが応答することがあります**。`npm start` は開発時のみに使ってください。

##### 初回セットアップ

Node.js 24 と、動画変換に使う ffmpeg・poppler-utils、告知画像の描画に使う chromium を入れておきます。

```bash
apt install git ffmpeg poppler-utils chromium   # Node.js 24 は NodeSource の apt リポジトリから入れる
useradd --system --create-home --home-dir /home/engineer-meetup --shell /usr/sbin/nologin engineer-meetup
runuser -u engineer-meetup -- git clone https://github.com/yuni-shinogami/engineer-meetup-discordbot.git /home/engineer-meetup/app
cd /home/engineer-meetup/app
runuser -u engineer-meetup -- npm ci && runuser -u engineer-meetup -- npm run build

# .env と state/ を置く（移設なら旧サーバーから両方を運ぶ）。VRC_STATE_DIR は /home/engineer-meetup/app/state にする
install -d -o engineer-meetup -g engineer-meetup -m 700 state assets/fonts
chown engineer-meetup:engineer-meetup .env && chmod 600 .env

install -m 644 deploy/engineer-meetup-bot.service deploy/engineer-meetup-deploy.service deploy/engineer-meetup-deploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now engineer-meetup-bot engineer-meetup-deploy.timer
```

## テスト

```bash
npm test
```

[Vitest](https://vitest.dev/) を使用しています。Discord・X・VRChat の各 API 呼び出しはモックし、
テンプレート置換や環境変数バリデーション、状態遷移などのロジックを検証しています。
`src/image-gen/__tests__/generate.test.ts` の描画テストは、Chromium（`CHROMIUM_PATH`、既定は `/usr/bin/chromium`）があるときだけ動きます。
Chromium の版で画素が揺れるため画像の一致は見ず、描いた画像を `src/image-gen/__tests__/__output__/` に書き出すので目で確かめてください。

`npm test` には import の決まり（[docs/ARCHITECTURE.md](ARCHITECTURE.md) の「依存の決まり」）の検査も入っています。決まりだけを見るときは `npm run deps:check`、依存関係の図を作り直すときは `npm run deps:graph` を使います。

## 告知画像のテンプレート

告知画像は **HTML と CSS をヘッドレス Chromium で描いて** PNG にしています。
以前は Satori で描いていましたが、使える CSS が限られていたため切り替えました。grid・グラデーション・`filter`・`text-shadow`・`object-fit` など、ブラウザで使える CSS はそのまま使えます。

| ファイル | 書くもの |
| :--- | :--- |
| `templates/<名前>.tsx` | 構造（React の要素）。差し込む文字列は自動でエスケープされる |
| `templates/<名前>.css` | 見た目。普通の CSS |

- フォントは `font-family: 'NotoSansJP'`（400 / 700）が使えます。ホストのフォントには頼らず、Bot が配ります
- 画像は data URL か、`assets/images/` 以下の相対パスで参照します（`generate.ts` の `imageAssets` に登録したものだけ）
- **外部の URL には取りに行きません。** 描画中のリクエストは Bot が配る素材と data URL 以外すべて遮断します
- 見た目を確かめるときは `npm run image:preview [出力先.png]` でサンプルの素材から PNG を書き出せます

本番では Chromium を `apt install chromium` で入れます。systemd の制限（`NoNewPrivileges`・HOME が読み取り専用）の下で動かすため、
サンドボックスを切り（`--no-sandbox`）、プロファイルは一時ディレクトリに置いています。描くのは Bot が組み立てた HTML だけで、外部への通信も遮断しているためです。
ブラウザは描画のときに起動し、使い終わって 60 秒たったら閉じます。
