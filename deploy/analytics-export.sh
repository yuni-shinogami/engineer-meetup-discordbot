#!/usr/bin/env bash
# engineer-meetup-analytics が取得用の鍵で ssh してきたときに動く。authorized_keys でその鍵をこのスクリプトに固定する
#   command="/usr/local/bin/analytics-export",restrict ssh-ed25519 AAAA...
# 鍵を置いたユーザー（root など）の権限で動くので、アプリのユーザーが書き換えられるリポジトリからは直接動かさず、
# root の持ち物としてコピーして使う（変えたらもう一度コピーする）:
#   install -m 755 -o root -g root /home/engineer-meetup/app/deploy/analytics-export.sh /usr/local/bin/analytics-export
#
#   （コマンドなし）  本番の LT の記録を返す（/usr/local/bin/lt-export。前からの動き）
#   activity          サーバーのアクティビティの集計（state/activity/ の日別ファイルと users.json）を tar.gz で返す
#   match-optins      マッチングに申し込んだ人の VRChat のユーザー ID の一覧（state/match/optin-ids.json）を返す
#   match-profiles    標準入力の JSON（申し込んだ人の活動の混ざり方と主なタグ）を state/match/profiles.json に置く
set -euo pipefail

ACTIVITY_DIR=/home/engineer-meetup/app/state/activity
MATCH_DIR=/home/engineer-meetup/app/state/match
# 受け取るプロフィールの大きさの上限（申し込んだ人だけなので、ふつうは数十 KB）
MAX_PROFILES_BYTES=4000000

case "${SSH_ORIGINAL_COMMAND:-}" in
  "")
    exec /usr/local/bin/lt-export
    ;;
  activity)
    cd "$ACTIVITY_DIR"
    exec tar -czf - --exclude='*.tmp' -- *.json
    ;;
  match-optins)
    if [ -f "$MATCH_DIR/optin-ids.json" ]; then cat "$MATCH_DIR/optin-ids.json"; else echo '[]'; fi
    ;;
  match-profiles)
    # Bot のユーザーの持ち物として置く（Bot が、やめた人の分をすぐ消せるように）
    install -d -o engineer-meetup -g engineer-meetup -m 700 "$MATCH_DIR"
    tmp=$(mktemp "$MATCH_DIR/profiles.json.XXXXXX")
    head -c "$MAX_PROFILES_BYTES" > "$tmp"
    if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf-8"))' "$tmp"; then
      rm -f "$tmp"
      echo 'JSON として読めませんでした' >&2
      exit 1
    fi
    chown engineer-meetup:engineer-meetup "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$MATCH_DIR/profiles.json"
    ;;
  *)
    echo "知らないコマンドです: ${SSH_ORIGINAL_COMMAND}" >&2
    exit 1
    ;;
esac
