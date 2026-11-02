# タスク「LT-Recorder-Click」から、ログイン中のデスクトップで実行される。
# VRChat を前面に出し、click.txt の指定どおりにマウスで視線を動かす・左クリックする・キーを押す。
#   click.txt: "<dx> <dy> <click:0|1> [キー]"   例) "0 3000 0" = 真下を向く / "0 0 0 shift+q"
# デスクトップモードの VRChat は照準が画面中央なので、視線を動かして照準を合わせてからクリックする。
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $dir 'click.log'
function Write-Log($message) { Add-Content -Path $log -Encoding utf8 -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" }

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class VrcInput {
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  const uint MOVE = 0x01, LEFTDOWN = 0x02, LEFTUP = 0x04, KEYUP = 0x02;
  public static void Move(int dx, int dy) {
    // 一度に大きく動かすと取りこぼすので小刻みに送る
    int steps = Math.Max(Math.Abs(dx), Math.Abs(dy)) / 4 + 1;
    for (int i = 1; i <= steps; i++) {
      mouse_event(MOVE, dx * i / steps - dx * (i - 1) / steps, dy * i / steps - dy * (i - 1) / steps, 0, UIntPtr.Zero);
      System.Threading.Thread.Sleep(15);
    }
  }
  public static void Click() {
    mouse_event(LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
    // 短すぎると VRChat のフレームの間に押下と解放が収まって取りこぼす
    System.Threading.Thread.Sleep(300);
    mouse_event(LEFTUP, 0, 0, 0, UIntPtr.Zero);
  }
  public static void Key(byte vk, bool up) {
    keybd_event(vk, (byte)MapVirtualKey(vk, 0), up ? KEYUP : 0, UIntPtr.Zero);
  }
}
'@

# "shift+q" → 修飾キーを押したまま最後のキーを押す
function Send-Keys($combo) {
  # ワールドのギミックは左右の Shift を区別するので lshift / rshift も受ける
  $names = @{ shift = 0x10; lshift = 0xA0; rshift = 0xA1; ctrl = 0x11; alt = 0x12; esc = 0x1B; space = 0x20; enter = 0x0D; tab = 0x09 }
  $vks = foreach ($name in $combo.ToLower() -split '\+') {
    if ($names.ContainsKey($name)) { [byte]$names[$name] }
    elseif ($name -match '^[a-z0-9]$') { [byte][char]$name.ToUpper() }
    elseif ($name -match '^f([1-9]|1[0-2])$') { [byte](0x6F + [int]$Matches[1]) }
    else { throw "不明なキー: $name" }
  }
  foreach ($vk in $vks) { [VrcInput]::Key($vk, $false); Start-Sleep -Milliseconds 60 }
  Start-Sleep -Milliseconds 200
  [array]::Reverse($vks)
  foreach ($vk in $vks) { [VrcInput]::Key($vk, $true); Start-Sleep -Milliseconds 60 }
}

try {
  $fields = (Get-Content (Join-Path $dir 'click.txt') -Raw).Trim() -split '\s+'
  $dx, $dy, $click = $fields[0..2] | ForEach-Object { [int]$_ }
  $keys = if ($fields.Count -gt 3) { $fields[3] } else { '' }
  $vrc = Get-Process VRChat -ErrorAction Stop | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
  if (-not $vrc) { throw 'VRChat のウィンドウが見つかりません' }
  $hwnd = $vrc.MainWindowHandle
  if ([VrcInput]::GetForegroundWindow() -ne $hwnd) {
    # 別のプロセスからの SetForegroundWindow は拒否されやすいので、Alt を押して前面化の制限を外す
    [VrcInput]::Key(0x12, $false)
    [VrcInput]::SetForegroundWindow($hwnd) | Out-Null
    [VrcInput]::Key(0x12, $true)
    Start-Sleep -Milliseconds 500
  }
  $front = [VrcInput]::GetForegroundWindow() -eq $hwnd
  if (-not $front) { throw 'VRChat を前面にできませんでした' }
  if ($dx -or $dy) { [VrcInput]::Move($dx, $dy); Start-Sleep -Milliseconds 300 }
  if ($click) { [VrcInput]::Click() }
  if ($keys) { Send-Keys $keys }
  Write-Log "ok move=($dx,$dy) click=$click keys=$keys"
} catch {
  Write-Log "失敗: $($_.Exception.Message)"
  exit 1
}
