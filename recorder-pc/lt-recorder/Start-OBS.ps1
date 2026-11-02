# タスク「LT-Recorder-OBS」から、ログイン中のデスクトップで実行される。OBS が動いていなければ起動する。
# lt.py が OBS に接続できなかったときに起動する（SSH のセッションから起動しても画面に出ないため）。
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $dir 'obs.log'
function Write-Log($message) { Add-Content -Path $log -Encoding utf8 -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" }

try {
  if (Get-Process obs64 -ErrorAction SilentlyContinue) { Write-Log '起動済み'; exit 0 }
  # OBS は作業ディレクトリが bin\64bit でないと起動に失敗する
  $obsDir = 'C:\Program Files\obs-studio\bin\64bit'
  # 前回が異常終了でも、セーフモードの確認ダイアログで止まらないようにする
  Start-Process -FilePath (Join-Path $obsDir 'obs64.exe') -WorkingDirectory $obsDir -ArgumentList '--disable-shutdown-check'
  Write-Log '起動しました'
} catch {
  Write-Log "失敗: $($_.Exception.Message)"
  exit 1
}
