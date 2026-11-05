# コマンド一覧

| コマンド | 説明 |
| :--- | :--- |
| `/confirm-meetup` | 今週の開催確認 YES/NO ボタンを運営チャンネルに送信 |
| `/event-calendar` | 次の集会を VRChat イベントカレンダーに登録（`action` で削除・ログインの確認も）。`production:False`（既定）では送信せずに入力した画面だけを返す。開催確認の YES でも自動で登録される |
| `/vrc-event` | 次の集会を VRChat のグループのイベントに登録（`action:削除` で本番で作った今週のイベントを削除）。`production:False`（既定）ではテスト用のグループにグループ内だけで作る。開催確認の YES でも自動で登録される |
| `/discord-event` | 次の集会の Discord のイベントを作成（`action:削除` で本番で作った今週のイベントを削除）。`production:False`（既定）では作らずに内容だけを返す。開催確認の YES でも自動で作られる |
| `/pre-announce` | X に事前告知（画像付き）を投稿し、翌日の LT 告知（X）も投稿（`lt-only:True` で LT だけ / `skip-lt:True` で LT を省略） |
| `/create-instance` | VRChat インスタンスを作成し招待 URL を取得。実行者が `/vrc-link` 登録済みなら本人にも招待を送る |
| `/vrc-link` | VRChat アカウントを登録し、招待を受け取れるようにする（`set` / `show` / `clear`） |
| `/post-announcement` | X 引用リポスト・Discord・VRCGroup への告知を一括実行し、当日 LT があれば Discord・VRCGroup の LT 告知も投稿（`lt-only:True` で LT だけ / `skip-lt:True` で LT を省略） |
| `/status` | Bot の設定状態と今週のスケジュール状況を確認 |
| `/check-permissions` | Bot が各チャンネルで必要な権限を持っているか確認 |
| `/generate-lt-image` | LT 告知画像を生成して返信 |
| `/lt-apply` | LT に応募（モーダル入力 → フォーラムポスト自動作成）。オプションなし |
| `/lt-material` | LT 告知の素材を登録（そろえば告知画像を自動生成） |

## `/generate-lt-image` のオプション

| オプション | 型 | 説明 |
| :--- | :--- | :--- |
| `title` | 文字列 | LT タイトル |
| `speaker-name` | 文字列 | スピーカー名 |
| `month` | 整数 (1-12) | 開催月 |
| `day` | 整数 (1-31) | 開催日 |
| `speaker-icon` | 添付ファイル | スピーカーアイコン画像 |
| `title-slide` | 添付ファイル | タイトルスライド画像 |
