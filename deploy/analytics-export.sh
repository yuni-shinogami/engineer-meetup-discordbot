#!/usr/bin/env bash
# engineer-meetup-analytics が取得用の鍵で ssh してきたときに動く。authorized_keys でその鍵をこのスクリプトに固定する
#   command="/usr/local/bin/analytics-export",restrict ssh-ed25519 AAAA...
# 鍵を置いたユーザー（root など）の権限で動くので、アプリのユーザーが書き換えられるリポジトリからは直接動かさず、
# root の持ち物としてコピーして使う（変えたらもう一度コピーする）:
#   install -m 755 -o root -g root /home/engineer-meetup/app/deploy/analytics-export.sh /usr/local/bin/analytics-export
#
#   （コマンドなし）  本番の LT の記録を返す（/usr/local/bin/lt-export。前からの動き）
#   activity          サーバーのアクティビティの集計（state/activity/ の日別ファイルと users.json）を tar.gz で返す
set -euo pipefail

ACTIVITY_DIR=/home/engineer-meetup/app/state/activity

case "${SSH_ORIGINAL_COMMAND:-}" in
  "")
    exec /usr/local/bin/lt-export
    ;;
  activity)
    cd "$ACTIVITY_DIR"
    exec tar -czf - --exclude='*.tmp' -- *.json
    ;;
  *)
    echo "知らないコマンドです: ${SSH_ORIGINAL_COMMAND}" >&2
    exit 1
    ;;
esac
