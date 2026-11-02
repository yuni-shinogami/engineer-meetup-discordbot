#!/bin/sh
# SSH から呼ぶ入口。Bot の鍵は authorized_keys の command= でこのスクリプトに固定しているので、
# Bot が送った文字列は SSH_ORIGINAL_COMMAND に入る。
#   request.sh "register <base64url の JSON>"
# 受け付けるのは決まった動詞と base64url だけで、中身の検証は vrceve.py が行う。結果は JSON 1 行で返す。
set -f  # 送られてきた文字列をファイル名として展開しない
dir=$(dirname "$(readlink -f "$0")")
set -- $SSH_ORIGINAL_COMMAND
case "${1:-}" in
  register|delete|check) ;;
  *) echo '{"ok": false, "error": "unknown request"}'; exit 2 ;;
esac
if [ $# -gt 2 ] || { [ -n "${2:-}" ] && ! printf '%s' "$2" | grep -Eq '^[A-Za-z0-9_-]{1,8000}$'; }; then
  echo '{"ok": false, "error": "bad payload"}'
  exit 2
fi
export NODE_OPTIONS=--no-deprecation  # Playwright の中の Node の警告を出さない
exec "$dir/.venv/bin/python" "$dir/vrceve.py" "$@"
