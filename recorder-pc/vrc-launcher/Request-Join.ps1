# SSH から呼ぶ入口。SSH のセッションから VRChat を直接起動しても画面に出ないので、
# 行き先を request.txt に書いてタスク「VRChat-Join」に起動させる。
#   Request-Join.ps1 "wrld_xxx:12345~group(grp_xxx)~groupAccessType(plus)~region(jp)"
# vrchat://launch?id=... の形で渡されても受け付ける。
# 頭に "wait " を付けると、起動を依頼する代わりに、直前に依頼した入室が終わるまで待って結果を返す。
#   Request-Join.ps1 "wait wrld_xxx:12345~..."   成功: exit 0 / 失敗・時間切れ: exit 1（理由は標準エラー）
# Bot の鍵は authorized_keys の command= でこのスクリプトに固定しているので、Bot が送った文字列は SSH_ORIGINAL_COMMAND に入る。
param([string]$Location = $env:SSH_ORIGINAL_COMMAND)
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Location) { Write-Error 'インスタンスが指定されていません'; exit 2 }

$Location = $Location.Trim()
$wait = $Location -match '^wait\s+'
$Location = $Location -replace '^wait\s+', '' -replace '^vrchat://launch\?(ref=[^&]*&)?id=', ''
if ($Location -notmatch '^wrld_[0-9a-f-]{36}:[A-Za-z0-9]+(~[A-Za-z]+\([A-Za-z0-9_.-]+\))*$') {
  Write-Error "インスタンスの形式が不正です: $Location"
  exit 2
}

if (-not $wait) {
  Set-Content -Path (Join-Path $dir 'request.txt') -Encoding ascii -Value $Location
  Start-ScheduledTask -TaskName 'VRChat-Join'
  "起動を依頼しました: $Location"
  exit 0
}

# --- 入室の完了を待つ ---
# 依頼した時刻（request.txt の更新時刻）より後の VRChat のログで、
#   Joining <location> → Finished entering world.（ワールドの読み込みまで終わった）
# が出たら成功。別のインスタンスに入った・起動に失敗した・時間切れなら失敗。
$timeoutSec = 180
$request = Get-Item (Join-Path $dir 'request.txt') -ErrorAction SilentlyContinue
if (-not $request -or (Get-Content $request.FullName -Raw).Trim() -ne $Location) {
  Write-Error 'このインスタンスへの入室は依頼されていません'
  exit 1
}
$since = $request.LastWriteTime
$logDir = Join-Path $env:USERPROFILE 'AppData\LocalLow\VRChat\VRChat'
$linePattern = '^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}) .*\[Behaviour\] (Joining (wrld_\S+)|Finished entering world\.)'

function Find-JoinResult {
  # 起動し直すとログは新しいファイルになる。依頼より後に書かれたものだけを見る
  $logs = Get-ChildItem (Join-Path $logDir 'output_log_*.txt') -ErrorAction SilentlyContinue |
    Where-Object LastWriteTime -ge $since | Sort-Object LastWriteTime
  $joined = $null
  foreach ($log in $logs) {
    foreach ($match in (Select-String -Path $log.FullName -Pattern $linePattern -Encoding utf8)) {
      $groups = $match.Matches[0].Groups
      $at = [datetime]::ParseExact($groups[1].Value, 'yyyy.MM.dd HH:mm:ss', $null)
      if ($at -lt $since.AddSeconds(-1)) { continue }
      if ($groups[3].Success) { $joined = $groups[3].Value }
      elseif ($joined) {
        if ($joined -ne $Location) { return @{ ok = $false; message = "別のインスタンスに入りました: $joined" } }
        return @{ ok = $true; message = "入室しました: $($at.ToString('HH:mm:ss'))" }
      }
    }
  }
  return $null
}

$deadline = (Get-Date).AddSeconds($timeoutSec)
while ((Get-Date) -lt $deadline) {
  $result = Find-JoinResult
  if ($result) {
    if ($result.ok) { $result.message; exit 0 }
    Write-Error $result.message
    exit 1
  }
  # 起動を担うタスクが失敗していれば、待っても入らない
  $failed = Get-Content (Join-Path $dir 'join.log') -Tail 3 -Encoding utf8 -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^(\S+ \S+) 失敗: (.*)$' -and [datetime]$Matches[1] -ge $since.AddSeconds(-1) } |
    Select-Object -Last 1
  if ($failed) {
    Write-Error "VRChat の起動に失敗しました: $($failed -replace '^\S+ \S+ 失敗: ', '')"
    exit 1
  }
  Start-Sleep -Seconds 3
}
if (-not (Get-Process VRChat -ErrorAction SilentlyContinue)) {
  Write-Error "$timeoutSec 秒待ちましたが、VRChat が起動していません"
} else {
  Write-Error "$timeoutSec 秒待ちましたが、入室が終わりませんでした"
}
exit 1
