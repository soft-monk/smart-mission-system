@echo off
REM ============================================================================
REM  Stop the tile fetcher (SAFE MODE)
REM
REM  Kills only python processes whose command line BOTH
REM    * contains  fetch_tiles.py
REM    * contains  this repository root
REM  Everything else (including other python jobs) is left alone.
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

powershell -NoProfile -Command ^
  "$repo = '%MAPAPP_ROOT%';" ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like '*fetch_tiles.py*' -and $_.CommandLine -like ('*' + $repo + '*') };" ^
  "if (-not $procs) { Write-Host 'no tile fetcher running.'; exit 0 }" ^
  "foreach ($p in $procs) { Write-Host ('killing tile fetcher PID ' + $p.ProcessId); Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }"

exit /b 0
