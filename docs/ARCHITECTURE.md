# Bot の構成

Bot の実装の地図です。「この機能はどのファイル？」「何をきっかけに動く？」「どこからどこへ import してよい？」に答えるためのもので、
機能の使い方は [features.md](features.md)、ファイルごとの役割はこのページの「[ディレクトリ構造](#ディレクトリ構造)」にあります。

機能を足したり、ファイルを移したりしたら、このページも合わせて直してください。

## フォルダーの分け方

`src/discordbot/` は、次の 4 つに分けています。

| 分類 | 場所 | 中身 |
| :--- | :--- | :--- |
| 機能 | `features/<機能>/` | `lt`（LT）・`calendar`（イベント登録）・`slides`（司会進行スライド）・`meetup`（開催確認と告知）・`instance`（VRChat の操作と録画）・`activity`（活動の集計）・`admin`（運営向けの確認） |
| 共通の部品 | `shared/` | どの機能からも使うもの |
| 土台 | `config.ts`・`storage.ts`・`interactions.ts` | 設定・週の状態・customId とコマンドの振り分け |
| 入口 | `index.ts`・`register-commands.ts`・`scheduler.ts` | 起動して機能を登録する・スラッシュコマンドを Discord に登録する・cron |

各機能のフォルダーには、外に見せるものを並べた `index.ts` と、コマンドやボタンの一覧（`BotFeature`）を書いた `feature.ts` があります。

## 機能とファイルの対応

一つの機能が複数のファイルにまたがっているので、機能から引けるようにまとめています（パスは `src/discordbot/` からの相対。`src/` 直下のものは `src/` から書く）。

| 機能 | きっかけ | 主なファイル |
| :--- | :--- | :--- |
| 開催確認 | 月曜 12:00（cron）・`/confirm-meetup`・YES/NO ボタン | `features/meetup/`（`weekly.ts`・`meetup.ts`・`commands/confirm-meetup.ts`）。cron の時刻は `features/meetup/schedules.ts` |
| イベント登録 | 開催確認の YES/NO・`/event-calendar`・`/vrc-event`・`/discord-event` | `features/calendar/`・`src/vrchat/groupEvent.ts`・`browser-desktop/` |
| 事前告知 | 木曜 19:00（cron）・`/pre-announce`・「今すぐ事前告知を投稿する」ボタン | `features/meetup/`（`weekly.ts`・`meetup.ts`・`commands/pre-announce.ts`）・`src/x/postAnnouncement.ts`。cron の時刻は `features/meetup/schedules.ts` |
| 開催告知 | `/post-announcement` | `features/meetup/commands/post-announcement.ts`・`src/x/quotePost.ts`・`src/vrchat/postGroupAnnouncement.ts` |
| インスタンスと招待 | `/create-instance`・`/vrc-link`・「サブアカウントで入る」「自分に招待」ボタン | `features/instance/`（`commands/`・`vrc-launcher.ts`・`vrc-invite.ts`・`vrc-links.ts`）・`src/vrchat/createInstance.ts`・`recorder-pc/vrc-launcher/` |
| LT の録画とラジオ準備 | 録画パネルのボタン（`/create-instance` の結果に付く） | `features/instance/lt-recorder.ts`・`recorder-pc/lt-recorder/` |
| LT の応募から告知まで | `/lt-apply`・`/lt-material`・フォーラムのポスト内のボタン・セレクト・モーダル・事前告知と開催告知 | `features/lt/`（外に見せるものは `features/lt/index.ts`）・`src/image-gen/` |
| 告知画像 | `/generate-lt-image`・LT の素材がそろったとき | `features/lt/commands/generate-lt-image.ts`・`features/lt/announce-image.ts`・`src/image-gen/` |
| 司会進行スライド | `/slides`・開催確認の YES | `features/slides/`・`src/canva/`・`src/video/` |
| 活動の集計 | Discord のイベント（メッセージ・リアクション・VC・参加と退出）・`npm run activity:backfill` | `features/activity/` |
| 状態の確認 | `/status`・`/check-permissions` | `features/admin/` |
| （共通の部品） | どの機能からも使う | `shared/interaction.ts`（運営ロールの確認・エラーの返信）・`shared/x-post-url.ts`（ツイートの URL）・`shared/meetup-dates.ts`（開催日の算出と日付の書式） |

## 入口

Bot が何かを始めるきっかけは、すべて各機能の `BotFeature`（`features/<機能>/feature.ts`）に書きます。

| きっかけ | 書く場所 |
| :--- | :--- |
| スラッシュコマンド | `BotFeature` の `commands` |
| ボタン・モーダル・セレクト | `BotFeature` の `buttons`・`modals`・`selects`（キーは customId の先頭） |
| 起動時の処理 | `BotFeature` の `onReady`（活動の集計を始める、LT フォーラムを確かめる など） |
| 定期実行 | cron の時刻は `features/meetup/schedules.ts`。`scheduler.ts` が登録し、`features/meetup` の `triggerConfirmMeetup`・`triggerPreAnnounce` を呼ぶ |

入口の `index.ts` は `FEATURES`（機能の `BotFeature` の一覧）を、`register-commands.ts` で Discord に登録し、`registerFeature`（`interactions.ts`）で振り分け先として登録します。
スラッシュコマンドは `dispatchCommand`、ボタン・モーダル・セレクトは `dispatchButton` などで、登録した機能に振り分けます。

- **機能にコマンドやボタンを足すとき**: その機能の `feature.ts`（`BotFeature`）に並べるだけで、入口は直しません。
- **新しい機能を作るとき**: `features/<機能>/` に `feature.ts` と `index.ts` を置き、`index.ts`（入口）の `FEATURES` に足します。
- **起動時の処理**は `FEATURES` の順に呼びます。1 つが失敗しても、ほかの機能の処理は続けます。

## 依存の決まり

import の向きに次の決まりがあり、`npm test`（`src/__tests__/dependencies.test.ts`）と `npm run deps:check` で検査します。
決まりそのものは [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) に書いてあります。

| 決まり | 理由 |
| :--- | :--- |
| 循環した import をしない（`no-circular`） | どちらを先に読み込むかで動きが変わり、追うのも難しい |
| `vrchat/`・`x/`・`canva/`・`image-gen/`・`video/` から `discordbot/` を import しない（`lib-not-to-bot`） | これらは Bot から使う部品。必要な値は呼び出し側から引数で受け取るか、部品の中だけで使う設定なら部品自身が環境変数から読む（`canva/config.ts` など） |
| `shared/` は `shared/` と `config.ts` のほかを import しない（`shared-not-to-features`） | `shared/` はどの機能からも使う共通の部品。特定の機能に引きずられないようにする |
| 機能の外からは `features/<機能>/index.ts` だけを import する（`features-via-index`・`features-via-index-between-features`） | 機能が外に見せているものを `index.ts` だけで一覧できるようにする。外で使うものが増えたら `index.ts` に export を足す（テストは中のファイルを直接モックしてよい） |
| 機能が頼ってよいのは、ほかの機能・`shared/`・`config.ts`・`interactions.ts`・`storage.ts`（と部品）だけ（`features-on-foundation`） | 入口（`index.ts`・`register-commands.ts`・`scheduler.ts`）に依存しない |
| LT からほかの機能は import しない（`lt-is-provider`） | LT は開催確認・イベント登録・録画などから使われる側 |
| イベント登録が使ってよいほかの機能は LT だけ（`calendar-is-provider`） | イベント登録は開催確認から使われる側。LT はイベント名に LT のタイトルを入れるのに使う |
| 司会進行スライドからほかの機能は import しない（`slides-is-provider`） | スライドは開催確認から使われる側 |
| 部品どうしは import しない（`libs-independent`） | 部品を組み合わせるのは Bot の側。部品は単独で読めるようにしておく |
| 外部サービスの SDK は受け持つ部品の中だけで使う（`twitter-sdk-only-in-x`・`axios-only-in-api-libs`・`renderer-only-in-image-gen`） | `twitter-api-v2` は `x/`、`axios` は `vrchat/`・`canva/`、`puppeteer-core`・`react-dom` は `image-gen/` だけ。外部とのやりとりを探す場所を固定する |
| 本番のコードから devDependencies を使わない（`not-to-dev-dep`） | テストや開発の道具に本番のコードが頼らないようにする（型だけの import は除く） |
| どこからも使われていないファイルを知らせる（`no-orphans`、警告だけ） | 使われていないなら消す |

### 今ある違反

ありません。決まりを入れた時点の違反（9 件）は、すべて直しました。

新しい決まりを足したときに、すぐには直せない違反があれば [`.dependency-cruiser-known-violations.json`](../.dependency-cruiser-known-violations.json) に控え（`npm run deps:baseline`）、ここに箇所を書いてください。控えた違反は検査では数えず、新しく増えたときだけ落ちます。直したら控えを作り直します。控えを作り直して違反を増やすことはしません。

## 依存関係の図

[dependency-graph.md](dependency-graph.md) にあります。`npm run deps:graph` で作り直せます。

## ディレクトリ構造

```
src/
  discordbot/
    index.ts        エントリーポイント。FEATURES（各機能の BotFeature）を登録する
    register-commands.ts  各機能のスラッシュコマンドを Discord に登録する
    config.ts        環境変数の読み込み
    scheduler.ts      定期実行の登録（時刻は features/meetup/schedules.ts、処理は features/meetup/weekly.ts）
    storage.ts        週次状態の永続化（state/storage.json）
    interactions.ts   BotFeature の型と、スラッシュコマンド・customId（ボタン・モーダル・セレクト）の振り分け
    features/         機能ごとのフォルダー。外からは各機能の index.ts だけを使う（docs/ARCHITECTURE.md）
      lt/
        index.ts        LT の機能が外に見せるもの
        feature.ts      LT のスラッシュコマンドとボタン・モーダル・セレクトの一覧（入口がまとめて登録する）
        commands/       LT のスラッシュコマンドとフォーラムのポスト内の操作（/lt-apply・/lt-material・/generate-lt-image など）
        types.ts        LtEntry / LtStatus の定義、未入力項目の判定
        status.ts       ステータスとフォーラムタグ名の対応・タグ ID 解決
        store.ts        LT レコードの永続化（state/lt-store.json、原子的書き込み）
        forum.ts        フォーラムポストの作成・タグ同期・ポスト内コンポーネント
        materials.ts    告知素材のダウンロードとローカル保存
        announce-image.ts  告知画像の生成と作り直し
        announce-text.ts   媒体ごとの告知文の組み立て
        announce.ts        X / Discord / VRChat への投稿（冪等・部分失敗対応）
        weekly-announce.ts 週次フローに同乗する LT 告知の一括投稿と運営への報告
        guard.ts        ポスト内コンポーネント操作の共通検証（本人確認・運営確認）
      calendar/       イベント登録（VRChat イベントカレンダー・VRChat のグループのイベント・Discord のイベント）と /event-calendar・/vrc-event・/discord-event
      slides/         司会進行スライド（Canva から PDF・動画を取って投稿）と /slides
      meetup/         開催確認（YES/NO）・事前告知・開催告知と /confirm-meetup・/pre-announce・/post-announcement
        weekly.ts       毎週の開催確認と事前告知の本体（scheduler.ts と「今すぐ事前告知を投稿する」ボタンから呼ぶ）
        meetup.ts       開催確認のメッセージと事前告知の投稿
        schedules.ts    毎週の定期実行の時刻（cron 式。CONFIRM_CRON・PRE_ANNOUNCE_CRON で変えられる）
      instance/       VRChat のインスタンス作成・招待・アカウント登録と /create-instance・/vrc-link
        vrc-launcher.ts   「サブアカウントで入る」ボタン（別の PC の VRChat を SSH で起動）
        vrc-invite.ts     「自分に招待」ボタン
        lt-recorder.ts    「LT録画開始」ボタンと録画パネル（別の PC の OBS で録画し、YouTube へ非公開でアップ）
      activity/       Discord の活動の集計（起動したら集計を始める）
        collector.ts    Discord のイベントと VC の見回りから集計を記録する
        store.ts        日別集計の足し込みと書き出し（state/activity/YYYY-MM-DD.json・users.json）
        backfill.ts     過去のメッセージ履歴からメッセージの集計を作り直す（npm run activity:backfill）
      admin/          運営向けの確認（/status・/check-permissions）
    shared/
      interaction.ts  どの機能からも使う、運営ロールの確認とエラーの返信
      x-post-url.ts   ツイート ID から投稿 URL を組み立てる（本番／テストのアカウントを選ぶ）
      meetup-dates.ts 次の開催日の算出と日付の書式（MEETUP_WEEKDAY に従う）
  x/
    xBot.ts           X (Twitter) API クライアント
    postAnnouncement.ts  事前告知ツイートの投稿
    profileImage.ts   X プロフィール画像 URL の取得
    quotePost.ts      開催告知の引用リポスト
    assets/           投稿テンプレート・画像
  vrchat/
    api/              VRChat API クライアント（vrchat-gateway 経由。ログイン中のアカウント・ユーザー・フレンド・インスタンス作成・投稿）
    actions/          VRChat 上のアクション（グループ投稿・招待）
    session.ts        ゲートウェイ経由のクライアントとログイン中のアカウントを取る
    links.ts          プロフィールURLの解釈と Discord ↔ VRChat 対応表の永続化
    postLtAnnouncement.ts  LT 告知のグループ掲示板投稿（インスタンス情報に依存しない）
    createInstance.ts     インスタンス作成フロー
    postGroupAnnouncement.ts  グループ掲示板への告知フロー
    assets/           グループ投稿テンプレート
  image-gen/
    generate.ts       画像生成エントリーポイント（テンプレートを HTML にして Chromium で描く）
    browser.ts        ヘッドレス Chromium の起動と描画
    fonts.ts          フォント読み込み
    preview.ts        テンプレートのプレビュー（npm run image:preview）
    templates/
      lt-announce.tsx     LT 告知画像テンプレート（構造）
      lt-announce.css     LT 告知画像テンプレート（見た目）
    assets/
      images/             テンプレートで使用する画像素材
assets/
  fonts/              フォントキャッシュ（自動生成、.gitignore 対象）
deploy/
  deploy.sh                       本番でのデプロイ（pull・ビルド・再起動・起動確認）
  auto-deploy.sh                  main に新しいコミットがあれば deploy.sh を実行し、失敗したら巻き戻す
  engineer-meetup-bot.service     本番の systemd ユニット
  engineer-meetup-deploy.service  auto-deploy.sh を実行するユニット
  engineer-meetup-deploy.timer    上を 1 分ごとに起動するタイマー
  analytics-export.sh             analytics が取得用の鍵で入ったときに動く（LT の記録とアクティビティの集計を返す）
```
