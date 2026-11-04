# Bot の構成

Bot の実装の地図です。「この機能はどのファイル？」「何をきっかけに動く？」「どこからどこへ import してよい？」に答えるためのもので、
機能の使い方は [README](../README.md)、ファイルごとの役割は README の「ディレクトリ構造」にあります。

機能を足したり、ファイルを移したりしたら、このページも合わせて直してください。

## 機能とファイルの対応

一つの機能が複数のファイルにまたがっているので、機能から引けるようにまとめています（パスは `src/discordbot/` からの相対。`src/` 直下のものは `src/` から書く）。

| 機能 | きっかけ | 主なファイル |
| :--- | :--- | :--- |
| 開催確認 | 月曜 12:00（cron）・`/confirm-meetup`・YES/NO ボタン | `scheduler.ts`・`meetup.ts`・`commands/confirm-meetup.ts` |
| イベント登録 | 開催確認の YES/NO・`/event-calendar`・`/vrc-event`・`/discord-event` | `vrceve.ts`・`vrc-event.ts`・`discord-event.ts`・`commands/{event-calendar,vrc-event,discord-event}.ts`・`src/vrchat/groupEvent.ts`・`browser-desktop/` |
| 事前告知 | 木曜 19:00（cron）・`/pre-announce`・「今すぐ事前告知を投稿する」ボタン | `scheduler.ts`・`meetup.ts`・`commands/pre-announce.ts`・`src/x/postAnnouncement.ts` |
| 開催告知 | `/post-announcement` | `commands/post-announcement.ts`・`src/x/quotePost.ts`・`src/vrchat/postGroupAnnouncement.ts` |
| インスタンスと招待 | `/create-instance`・`/vrc-link`・「サブアカウントで入る」「自分に招待」ボタン | `commands/{create-instance,vrc-link}.ts`・`vrc-launcher.ts`・`vrc-invite.ts`・`vrc-links.ts`・`src/vrchat/createInstance.ts`・`recorder-pc/vrc-launcher/` |
| LT の録画とラジオ準備 | 録画パネルのボタン（`/create-instance` の結果に付く） | `lt-recorder.ts`・`recorder-pc/lt-recorder/` |
| LT の応募から告知まで | `/lt-apply`・`/lt-material`・フォーラムのポスト内のボタン・セレクト・モーダル・事前告知と開催告知 | `lt/`・`commands/lt-*.ts`・`src/image-gen/` |
| 告知画像 | `/generate-lt-image`・LT の素材がそろったとき | `commands/generate-lt-image.ts`・`lt/announce-image.ts`・`src/image-gen/` |
| 司会進行スライド | `/slides` | `slides.ts`・`commands/slides.ts`・`src/canva/`・`src/video/` |
| 活動の集計 | Discord のイベント（メッセージ・リアクション・VC・参加と退出） | `activity/` |
| 状態の確認 | `/status`・`/check-permissions` | `commands/{status,check-permissions}.ts` |

## 入口

Bot が何かを始めるきっかけは、次の 4 か所で登録しています。

| きっかけ | 登録している場所 |
| :--- | :--- |
| スラッシュコマンド | 定義を `commands/index.ts` の `registerCommands` に並べ、`index.ts` の `switch` で振り分ける |
| ボタン・モーダル・セレクト | `handlers.ts` で customId とハンドラを紐づけ、`interactions.ts` が振り分ける |
| 定期実行 | `scheduler.ts`（開催確認と事前告知の 2 つ） |
| Discord のイベント | `activity/collector.ts` |

いまはスラッシュコマンドを 1 つ足すと、`commands/<名前>.ts` のほかに `commands/index.ts`（export と `registerCommands`）と `index.ts`（`switch`）も直す必要があります。

## 依存の決まり

import の向きに次の決まりがあり、`npm test`（`src/__tests__/dependencies.test.ts`）と `npm run deps:check` で検査します。
決まりそのものは [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) に書いてあります。

| 決まり | 理由 |
| :--- | :--- |
| 循環した import をしない（`no-circular`） | どちらを先に読み込むかで動きが変わり、追うのも難しい |
| `vrchat/`・`x/`・`canva/`・`image-gen/`・`video/` から `discordbot/` を import しない（`lib-not-to-bot`） | これらは Bot から使う部品。必要な値（設定など）は呼び出し側から引数で受け取る |
| `commands/utils` はスラッシュコマンドからだけ使う（`commands-utils-only-from-commands`） | コマンド以外からも使うものは、共通の場所に置く |
| 部品どうしは import しない（`libs-independent`） | 部品を組み合わせるのは Bot の側。部品は単独で読めるようにしておく |
| 外部サービスの SDK は受け持つ部品の中だけで使う（`twitter-sdk-only-in-x`・`axios-only-in-api-libs`・`renderer-only-in-image-gen`） | `twitter-api-v2` は `x/`、`axios` は `vrchat/`・`canva/`、`puppeteer-core`・`react-dom` は `image-gen/` だけ。外部とのやりとりを探す場所を固定する |
| 本番のコードから devDependencies を使わない（`not-to-dev-dep`） | テストや開発の道具に本番のコードが頼らないようにする（型だけの import は除く） |
| どこからも使われていないファイルを知らせる（`no-orphans`、警告だけ） | 使われていないなら消す |

### 今ある違反

決まりを入れた時点ですでにあった違反は [`.dependency-cruiser-known-violations.json`](../.dependency-cruiser-known-violations.json) に控えてあり、検査では数えません（新しく増えたときだけ落ちます）。
直したら `npm run deps:baseline` で控えを作り直してください。控えを作り直して違反を増やすことはしません。

| 決まり | 箇所 |
| :--- | :--- |
| `lib-not-to-bot` | `src/canva/auth.ts`・`src/canva/login.ts`・`src/x/postUrl.ts` → `config.ts`、`src/x/postAnnouncement.ts` → `lt/dates.ts` |
| `commands-utils-only-from-commands` | `lt/guard.ts`・`lt-recorder.ts`・`vrc-launcher.ts`・`vrc-invite.ts` → `commands/utils.ts` |

## 依存関係の図

[dependency-graph.md](dependency-graph.md) にあります。`npm run deps:graph` で作り直せます。
