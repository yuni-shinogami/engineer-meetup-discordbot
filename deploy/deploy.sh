#!/usr/bin/env bash
# 本番サーバーでコード変更を反映する。root で実行する。
#   ssh engineer-meetup-bot /home/engineer-meetup/app/deploy/deploy.sh
# main へのマージは auto-deploy.sh が 1 分以内に自動で反映するので、普段は手で実行しなくてよい。
set -euo pipefail

APP_DIR=/home/engineer-meetup/app
SERVICE=engineer-meetup-bot

# 自動デプロイと同時に走らないようにする。auto-deploy.sh から呼ばれたときは呼び出し元がロック済み
if [ -z "${DEPLOY_LOCK_HELD:-}" ]; then
  exec 9>/run/lock/engineer-meetup-deploy.lock
  flock -n 9 || { echo "別のデプロイが実行中です" >&2; exit 1; }
fi

cd "$APP_DIR"
as_app_user() { runuser -u engineer-meetup -- "$@"; }

as_app_user git pull --ff-only
as_app_user npm ci --no-audit --no-fund
as_app_user npm run build

started=$(date '+%Y-%m-%d %H:%M:%S')
systemctl restart "$SERVICE"

# Restart=always なので起動に失敗しても is-active は通ってしまう。ログインできたことをログで確かめる
for _ in $(seq 30); do
  if journalctl -u "$SERVICE" --since "$started" -o cat | grep -q '^Ready! Logged in'; then
    journalctl -u "$SERVICE" --since "$started" --no-pager -o cat
    echo "デプロイ完了: $(as_app_user git log -1 --oneline)"
    exit 0
  fi
  sleep 1
done

journalctl -u "$SERVICE" --since "$started" --no-pager -o cat
echo "30 秒以内に Discord へのログインを確認できませんでした" >&2
exit 1
