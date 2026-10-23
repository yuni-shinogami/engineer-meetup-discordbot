#!/usr/bin/env bash
# origin/main に新しいコミットがあればデプロイする。engineer-meetup-deploy.timer から root で 1 分ごとに実行される。
# デプロイに失敗したら直前のコミットに戻して運営チャンネルに知らせ、同じコミットは main が進むまで再試行しない。
set -euo pipefail

APP_DIR=/home/engineer-meetup/app
SERVICE=engineer-meetup-bot
FAILED_FILE=/var/lib/engineer-meetup-deploy/failed-commit

exec 9>/run/lock/engineer-meetup-deploy.lock
flock -n 9 || exit 0
export DEPLOY_LOCK_HELD=1

cd "$APP_DIR"
as_app_user() { runuser -u engineer-meetup -- "$@"; }

env_value() {
  grep -m1 "^$1=" .env | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

# Bot のトークンで運営チャンネルに投稿する。トークンがプロセス一覧に出ないようヘッダーは標準入力から渡す
notify() {
  local channel payload
  channel=$(env_value OPERATIONS_CHANNEL_ID)
  payload=$(node -e 'process.stdout.write(JSON.stringify({ content: process.argv[1] }))' "$1")
  printf 'Authorization: Bot %s\n' "$(env_value DISCORD_TOKEN)" \
    | curl -sS -m 10 -o /dev/null -H @- -H 'Content-Type: application/json' -d "$payload" \
      "https://discord.com/api/v10/channels/$channel/messages" || true
}

as_app_user git fetch -q origin main
current=$(as_app_user git rev-parse HEAD)
target=$(as_app_user git rev-parse origin/main)

[ "$current" = "$target" ] && exit 0
[ -f "$FAILED_FILE" ] && [ "$(cat "$FAILED_FILE")" = "$target" ] && exit 0

echo "デプロイ開始: ${current:0:7} → ${target:0:7}"
if "$APP_DIR/deploy/deploy.sh"; then
  rm -f "$FAILED_FILE"
  exit 0
fi

echo "$target" > "$FAILED_FILE"
echo "デプロイに失敗したので ${current:0:7} に戻します" >&2
if as_app_user git reset -q --hard "$current" \
  && as_app_user npm ci --no-audit --no-fund \
  && as_app_user npm run build \
  && systemctl restart "$SERVICE"; then
  result="${current:0:7} に戻しました。"
else
  result="${current:0:7} への巻き戻しにも失敗しました。至急確認してください。"
fi

notify "⚠️ 自動デプロイに失敗しました（${target:0:7}）。${result}
詳細はサーバーで \`journalctl -u engineer-meetup-deploy\` を確認してください。"
exit 1
