@echo off
REM ============================================================================
REM  Fetch basemap tiles into tiles\raster (idempotent: existing files skipped)
REM  Source: Esri World Imagery (no API key). ~13k tiles: world z0-6,
REM  Beijing z7-14, Shanghai z7-13. Direct connection works; a proxy gets 403.
REM
REM  Safe to interrupt: rerun the same command to resume where it stopped.
REM  Stop it with: scripts\stop_tiles.bat
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

if not defined MAPAPP_PYTHON (
  echo [FAIL] Python not found. Run scripts\doctor.bat for details.
  exit /b 1
)

cd /d "%MAPAPP_ROOT%"
echo fetching tiles into tiles\raster ...
echo   python : %MAPAPP_PYTHON%
echo   stop   : scripts\stop_tiles.bat      resume: run this script again
echo.
%MAPAPP_PYTHON% scripts\fetch_tiles.py %*
set "RC=%ERRORLEVEL%"
echo.
echo [done] fetch_tiles.py exit=%RC%
exit /b %RC%
