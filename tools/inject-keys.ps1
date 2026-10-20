# Inject 'A' press and verify with GetAsyncKeyState whether injection works at all
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Kbd {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
}
"@
[Kbd]::keybd_event(0x41, 0, 0, [UIntPtr]::Zero)   # A down
Start-Sleep -Milliseconds 60
$state = [Kbd]::GetAsyncKeyState(0x41)
$pressed = ($state -band 0x8000) -ne 0
Write-Output "asyncKeyState=0x$('{0:X4}' -f $state) pressed=$pressed"
[Kbd]::keybd_event(0x41, 0, 2, [UIntPtr]::Zero)   # A up
