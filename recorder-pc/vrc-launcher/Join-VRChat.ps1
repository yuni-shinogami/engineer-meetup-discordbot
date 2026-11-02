# タスク「VRChat-Join」から、ログイン中のデスクトップで実行される。
# request.txt に書かれたインスタンスへ、デスクトップモードの VRChat で入る。動いている VRChat は終了してから起動し直す。
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $dir 'join.log'
function Write-Log($message) { Add-Content -Path $log -Encoding utf8 -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" }

try {
  $location = (Get-Content (Join-Path $dir 'request.txt') -Raw).Trim()
  # Request-Join.ps1 でも確かめているが、ファイルを直接書き換えられた場合に備えてここでも確かめる
  if ($location -notmatch '^wrld_[0-9a-f-]{36}:[A-Za-z0-9]+(~[A-Za-z]+\([A-Za-z0-9_.-]+\))*$') { throw "インスタンスの形式が不正です: $location" }

  $running = Get-Process VRChat -ErrorAction SilentlyContinue
  if ($running) {
    Write-Log "起動中の VRChat を終了します"
    $running | Stop-Process -Force
    $running | Wait-Process -Timeout 30 -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
  }

  $vrchatDir = 'C:\Program Files (x86)\Steam\steamapps\common\VRChat'
  Start-Process -FilePath (Join-Path $vrchatDir 'launch.exe') -WorkingDirectory $vrchatDir -ArgumentList "`"vrchat://launch?id=$location`"", '--no-vr'
  Write-Log "起動しました: $location"
} catch {
  Write-Log "失敗: $($_.Exception.Message)"
  exit 1
}
