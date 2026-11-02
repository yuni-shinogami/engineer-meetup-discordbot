# SSH から呼ぶ入口。Bot の鍵は authorized_keys の command= でこのスクリプトに固定しているので、
# Bot が送った文字列は SSH_ORIGINAL_COMMAND に入る。
#   Request-Recorder.ps1 "start <base64url の JSON>"
# 受け付けるのは決まった動詞と base64url だけで、中身の検証は lt.py が行う。結果は JSON 1 行で返す。
# stop が成功したら、編集とアップロードはタスク「LT-Recorder-Pipeline」に任せて SSH はすぐ返す。
param([string]$Request = $env:SSH_ORIGINAL_COMMAND)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ("$Request".Trim() -notmatch '^(start|radio|mark|end|stop|status)( [A-Za-z0-9_-]{1,4000})?$') {
  '{"ok":false,"error":"リクエストの形式が不正です"}'
  exit 2
}
$verb = $Matches[1]
$arguments = @((Join-Path $dir 'lt.py'), $verb)
if ($Matches[2]) { $arguments += $Matches[2].Trim() }

& (Join-Path $dir '.venv\Scripts\python.exe') @arguments
$code = $LASTEXITCODE
if ($verb -eq 'stop' -and $code -eq 0) { Start-ScheduledTask -TaskName 'LT-Recorder-Pipeline' }
exit $code
