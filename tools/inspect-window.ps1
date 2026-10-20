# 检查 workcalf 窗口属性 + PrintWindow 抓内容（适用于无活动显示的会话）
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@

$script:found = @()
$cb = [Win32+EnumWindowsProc]{ param($h, $lp)
  $wpid = 0
  [Win32]::GetWindowThreadProcessId($h, [ref]$wpid) | Out-Null
  $p = Get-Process -Id $wpid -ErrorAction SilentlyContinue
  if ($p -and $p.ProcessName -ieq 'workcalf') {
    $sb = New-Object System.Text.StringBuilder 256
    [Win32]::GetClassName($h, $sb, 256) | Out-Null
    $cls = $sb.ToString()
    $r = New-Object Win32+RECT
    [Win32]::GetWindowRect($h, [ref]$r) | Out-Null
    $vis = [Win32]::IsWindowVisible($h)
    $ex = [Win32]::GetWindowLong($h, -20)  # GWL_EXSTYLE
    $topmost = ($ex -band 0x8) -ne 0
    $layered = ($ex -band 0x80000) -ne 0
    $clickthrough = ($ex -band 0x20) -ne 0
    $script:found += "HWND=0x$($h.ToString('X')) CLASS='$cls' VIS=$vis RECT=($($r.L),$($r.T))-($($r.R),$($r.B)) SIZE=$($r.R-$r.L)x$($r.B-$r.T) TOPMOST=$topmost LAYERED=$layered CLICKTHRU=$clickthrough"
    if ($vis -and ($r.R - $r.L) -ge 100 -and $cls -ieq 'Tauri Window') {
      $w = $r.R - $r.L; $hh = $r.B - $r.T
      $bmp = New-Object System.Drawing.Bitmap $w, $hh
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $hdc = $g.GetHdc()
      $ok = [Win32]::PrintWindow($h, $hdc, 3)  # PW_RENDERFULLCONTENT
      $g.ReleaseHdc($hdc)
      $g.Dispose()
      $bmp.Save("C:\env_code\WorkCalf\pet_window.png")
      $script:found += "PrintWindow ok=$ok saved=$w x $hh"
    }
  }
  return $true
}
[Win32]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
$script:found
