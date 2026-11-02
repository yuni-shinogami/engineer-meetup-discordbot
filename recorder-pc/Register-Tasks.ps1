# 録画 PC にタスクスケジューラのタスクを 4 つ登録する。録画 PC にログインするユーザーで、管理者の PowerShell から実行する。
#   powershell -ExecutionPolicy Bypass -File Register-Tasks.ps1
# SSH のセッションから起動したプログラムはデスクトップに出ないので、画面が要る処理はタスク経由で
# ログイン中のデスクトップ（InteractiveToken）で動かす。どのタスクもトリガーはなく、スクリプトから Start-ScheduledTask で起動する。
param(
  [string]$LauncherDir = 'C:\ProgramData\vrc-launcher',
  [string]$RecorderDir = 'C:\ProgramData\lt-recorder'
)
$ErrorActionPreference = 'Stop'
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive

function Register($name, $description, $action, $limit) {
  # ノート PC なので、バッテリー駆動でも止めない
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit $limit
  Register-ScheduledTask -TaskName $name -Description $description -Action $action -Principal $principal `
    -Settings $settings -Force | Out-Null
  "登録しました: $name"
}

Register 'VRChat-Join' 'request.txt のインスタンスへ VRChat（デスクトップモード）で入る' `
  (New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$LauncherDir\Join-VRChat.ps1`"") `
  (New-TimeSpan -Minutes 5)

Register 'LT-Recorder-Click' 'VRChat の視線を動かして左クリックする（入室時のダイアログを閉じる）' `
  (New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $RecorderDir `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$RecorderDir\Click-VRChat.ps1`"") `
  (New-TimeSpan -Minutes 5)

Register 'LT-Recorder-OBS' 'OBS を起動する（lt.py が OBS に接続できなかったときに起動）' `
  (New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $RecorderDir `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$RecorderDir\Start-OBS.ps1`"") `
  (New-TimeSpan -Minutes 5)

Register 'LT-Recorder-Pipeline' 'LT 録画の編集と YouTube アップロード（Request-Recorder.ps1 の stop から起動）' `
  (New-ScheduledTaskAction -Execute "$RecorderDir\.venv\Scripts\python.exe" -WorkingDirectory $RecorderDir `
    -Argument "`"$RecorderDir\lt.py`" pipeline") `
  (New-TimeSpan -Hours 6)
