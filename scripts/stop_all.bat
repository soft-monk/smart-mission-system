@echo off
REM ============================================================================
REM  mapApp - stop runtime processes  (SAFE MODE)
REM
REM     stop_all.bat          stop C++ backend + AI bridge   (default)
REM     stop_all.bat tiles    stop the tile fetcher only
REM     stop_all.bat all      stop everything
REM
REM  The real work is done by scripts\stop_all.ps1, which verifies ownership by
REM  walking the parent-process chain (a venv python.exe re-executes the base
REM  interpreter as a child, so the process actually holding the port often has
REM  no repo path in its own command line) and kills whole process trees - that
REM  is what also closes the "mapapp-ai" / "mapapp-server" console windows.
REM
REM  Never kills: node.exe, the DSH shell, or anything not traced back to this repo.
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

set "MODE=services"
if /i "%~1"=="tiles" set "MODE=tiles"
if /i "%~1"=="all"   set "MODE=all"

echo stopping mapApp runtime ^(mode=%MODE%^) ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_all.ps1" -Mode %MODE% -Repo "%MAPAPP_ROOT%"
set "RC=%ERRORLEVEL%"
echo done ^(exit=%RC%^).
exit /b %RC%
