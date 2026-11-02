# recorder-pc

Bot から SSH で操作する録画 PC（Windows のゲーミングノート）側のスクリプトです。Bot 本体（`src/`）とは別に、録画 PC の `C:\ProgramData\` 以下に置いて使います。

| フォルダ | 置き場所 | 役割 |
| --- | --- | --- |
| `vrc-launcher/` | `C:\ProgramData\vrc-launcher\` | 「🖥️ サブアカウントで入る」: VRChat をデスクトップモードで起動してインスタンスに入り、ログで入室を確かめる |
| `lt-recorder/` | `C:\ProgramData\lt-recorder\` | 「LT録画」: OBS で録画 → LT ごとに編集・サムネイル作成 → YouTube に非公開でアップロード |

## しくみ

- Bot の鍵は、録画 PC の `administrators_authorized_keys` の `command=` で、実行できるスクリプトを 1 つに固定しています（[`authorized_keys.example`](authorized_keys.example)）。Bot が送った文字列は `SSH_ORIGINAL_COMMAND` で受け取ります。
  - `vrc-launcher/Request-Join.ps1`: インスタンスを `request.txt` に書いてタスク `VRChat-Join` を起動する。`wait <インスタンス>` で入室の完了を待つ
  - `lt-recorder/Request-Recorder.ps1`: `start` / `mark` / `end` / `stop` / `status` を `lt.py` に渡し、JSON 1 行で返す
- SSH のセッションから起動したプログラムはデスクトップに出ないので、画面が要る処理はタスクスケジューラのタスクで、ログイン中のデスクトップで動かします。
  - `VRChat-Join` → `vrc-launcher/Join-VRChat.ps1`
  - `LT-Recorder-Click` → `lt-recorder/Click-VRChat.ps1`（VRChat の視線を動かしてクリック・キー入力）
  - `LT-Recorder-Pipeline` → `lt.py pipeline`（録画停止のあとの編集とアップロード）
- 編集の作りは、過去に手作業で編集した LT 動画（YouTube @engineer-meetup）に合わせています。設定は [`lt-recorder/config.toml`](lt-recorder/config.toml) にまとめています（集会名、編集の秒数、YouTube のタイトル・説明欄、ワールドごとの移動手順など）。

## 録画 PC の準備

1. 必要なもの: VRChat（Steam）、OBS Studio（obs-websocket を有効にする。パスワードは OBS の設定ファイルから読む）、Python 3.12、ffmpeg（`winget install ffmpeg`）、OpenSSH サーバー
2. このフォルダの `vrc-launcher/` と `lt-recorder/` を `C:\ProgramData\` にコピーする
3. Python の仮想環境を作る

   ```powershell
   cd C:\ProgramData\lt-recorder
   py -3.12 -m venv .venv
   .venv\Scripts\python.exe -m pip install -r <このフォルダ>\requirements.txt
   ```

4. リポジトリに入れていない素材を置く
   - `lt-recorder/assets/NotoSansJP-VF.ttf`: [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP)（可変フォント）
   - `lt-recorder/assets/ending.wav`: エンディング曲（騒音のない世界「電脳都市にて」）。再配布になるので入れていない
   - 背景除去のモデル（`birefnet-general-lite`）は、初回に `lt-recorder/models/` へ自動でダウンロードされる
5. 管理者の PowerShell で、録画 PC にログインするユーザーとしてタスクを登録する: `powershell -ExecutionPolicy Bypass -File Register-Tasks.ps1`
6. Bot の公開鍵を `C:\ProgramData\ssh\administrators_authorized_keys` に足す（[`authorized_keys.example`](authorized_keys.example)）
7. YouTube の認可（初回のみ）: Google Cloud で作った OAuth クライアント（デスクトップアプリ）の `client_secret.json` を `lt-recorder/` に置き、`lt.py auth` で集会のチャンネルのアカウントで許可する。`token.json` ができる
   - `client_secret.json` と `token.json` はリポジトリに入れない（`.gitignore` 済み）

## 書き換えるときの注意

- `.ps1` は **UTF-8（BOM 付き）** で保存する。Windows PowerShell 5 は BOM のないファイルを ANSI（Shift_JIS）として読むので、日本語のメッセージやコメントが壊れる
- 逆に `config.toml` は **BOM なし** にする（Python の `tomllib` が読めなくなる）。録画 PC 上で PowerShell 5 の `Set-Content -Encoding UTF8` で書き換えると BOM が付くので、手元で直してコピーする
- Bot から呼ばれる動詞や返す JSON を変えたら、Bot 側（`src/discordbot/lt-recorder.ts`・`src/discordbot/vrc-launcher.ts`）も合わせて直す
- 録画 PC への反映は手作業（`scp` などでコピー）。`main` にマージしても録画 PC には自動では入らない
