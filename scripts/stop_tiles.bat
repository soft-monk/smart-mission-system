@echo off
REM ============================================================================
REM  Stop the tile fetcher (SAFE MODE) - thin wrapper over stop_all.ps1
REM  Only processes traced back to this repo whose command line runs
REM  fetch_tiles.py are killed (plus their tree, e.g. the python launcher chain).
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

echo stopping tile fetcher ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_all.ps1" -Mode tiles -Repo "%MAPAPP_ROOT%"
set "RC=%ERRORLEVEL%"
echo done ^(exit=%RC%^).
exit /b %RC%
