# Bot の構成

Bot の実装の地図です。「この機能はどのファイル？」「何をきっかけに動く？」「どこからどこへ import してよい？」に答えるためのもので、
機能の使い方は [README](../README.md)、ファイルごとの役割は README の「ディレクトリ構造」にあります。

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
| LT 会 | `/lt-event` | `features/lt/events.ts`（記録・候補日・枠数）・`features/lt/commands/lt-event.ts` |
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
