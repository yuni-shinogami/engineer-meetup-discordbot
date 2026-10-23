#!/usr/bin/env bash
# 本番サーバーでコード変更を反映する。root で実行する。
#   ssh discord-bot /home/bot/app/deploy/deploy.sh
set -euo pipefail

APP_DIR=/home/bot/app
SERVICE=engineer-meetup-bot

cd "$APP_DIR"
as_bot() { runuser -u bot -- "$@"; }

as_bot git pull --ff-only
as_bot npm ci --no-audit --no-fund
as_bot npm run build

started=$(date '+%Y-%m-%d %H:%M:%S')
systemctl restart "$SERVICE"

# Restart=always なので起動に失敗しても is-active は通ってしまう。ログインできたことをログで確かめる
for _ in $(seq 30); do
  if journalctl -u "$SERVICE" --since "$started" -o cat | grep -q '^Ready! Logged in'; then
    journalctl -u "$SERVICE" --since "$started" --no-pager -o cat
    echo "デプロイ完了: $(git log -1 --oneline)"
    exit 0
  fi
  sleep 1
done

journalctl -u "$SERVICE" --since "$started" --no-pager -o cat
echo "30 秒以内に Discord へのログインを確認できませんでした" >&2
exit 1
