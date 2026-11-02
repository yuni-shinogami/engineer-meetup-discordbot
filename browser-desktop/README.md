# browser-desktop

Bot から SSH で頼んで、ログイン済みの Chrome でブラウザの操作をするデスクトップ VM 側のスクリプトです。

今は VRChat イベントカレンダー（https://vrceve.com/）への登録だけを置いています（`vrceve/`）。登録は Google フォームで、送る人が Google にログインしている必要があるため（荒らし対策でメールアドレスを記録する）、Bot からは直接送れません。

## しくみ

- VM は Ubuntu + XFCE。起動するとデスクトップに自動でログインし、自動操作用の Chrome が立ち上がる（`vrceve-chrome.desktop`）
  - 普段使いと分けた専用のプロファイル（`~/.config/vrceve-chrome`）で、集会用アカウントにログインしておく
  - DevTools のポート（127.0.0.1:9222）にだけ外からつなぐ。Playwright が起動した Chrome より、Google に自動操作として弾かれにくい
- Bot の鍵は、VM の `~/.ssh/authorized_keys` の `command=` で `vrceve/request.sh` に固定する。Bot が送った文字列は `SSH_ORIGINAL_COMMAND` に入る
  - `register <base64url の JSON>`: フォームに入力して送信し、編集用 URL を返す。`dry_run` なら送らずに入力した画面（JPEG）を返す
  - `delete <base64url の JSON>`: 編集用 URL から「イベントを削除する」で送り直す
  - `check`: Chrome が動いていて、集会用アカウントでログインしているか
- フォームの項目と entry 番号は `vrceve/config.toml`。中身（イベント名・時刻・内容など）は Bot 側（`src/discordbot/vrceve.ts`）で決める

### フォームの癖

- 2 ページに分かれている（日時など → 主催者・内容など）。ログインしていないと「次へ」を押せない
- ログイン中は入力途中の内容が下書きとして残り、下書きがあると事前入力の URL を開いても下書きが出る。開く前に「フォームをクリア」で消し、イベント名が送るつもりの値になったかを確かめてから進める
- 「メールアドレスを記録する」の文言はログインの有無で変わる

## VM の準備

1. Proxmox でテンプレートから VM を作る（2 コア・4GB・32GB で足りる。画面を使うので `--vga std`）
2. デスクトップと Chrome を入れる

   ```sh
   sudo apt-get install -y xfce4 xfce4-terminal lightdm lightdm-gtk-greeter dbus-x11 fonts-noto-cjk fonts-noto-color-emoji language-pack-ja python3-venv
   curl -fsSLO https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && sudo apt-get install -y ./google-chrome-stable_current_amd64.deb
   ```

3. 自動ログイン: `/etc/lightdm/lightdm.conf.d/50-autologin.conf` に `[Seat:*]` / `autologin-user=<ユーザー>` / `autologin-session=xfce`、`sudo systemctl set-default graphical.target`
4. このフォルダの `vrceve/` を `~/vrceve` に置き、仮想環境を作る: `python3 -m venv ~/vrceve/.venv && ~/vrceve/.venv/bin/pip install playwright==1.58.0`（ブラウザは入れた Chrome を使うので `playwright install` は不要）
5. `cp ~/vrceve/vrceve-chrome.desktop ~/.config/autostart/` して、デスクトップに入り直す
6. Proxmox のコンソールで VM の画面を開き、立ち上がった Chrome で集会用アカウントに Google ログインする。ログインが切れたら同じ手順でログインし直す
7. Bot の公開鍵を `~/.ssh/authorized_keys` に足す

   ```
   command="/home/<ユーザー>/vrceve/request.sh",from="<BOT_HOST_IP>",restrict ssh-ed25519 <PUBLIC_KEY> engineer-meetup-bot-vrceve
   ```

8. Bot の `.env` に `VRCEVE_SSH_KEY`（秘密鍵のパス）と `VRCEVE_SSH_TARGET`（`<ユーザー>@<VM の IP>`）を書く

## 確かめ方

VM の上で、Bot と同じ入口を直接呼べる。

```sh
cd ~/vrceve
SSH_ORIGINAL_COMMAND=check ./request.sh
# 送らずに入力だけ（画面は ~/.local/state/vrceve/ に保存される）
P=$(printf '{"dry_run":true,"fields":{"name":"エンジニア集会","android":"PC/android","start":"2026-11-06 22:00","end":"2026-11-06 23:30","action":"イベントを登録する","organizer":"…"}}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
SSH_ORIGINAL_COMMAND="register $P" ./request.sh
```
