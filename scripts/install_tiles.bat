@echo off
REM ============================================================================
REM  Install basemap tiles from ONE archive (instead of fetching 14k files)
REM
REM  Usage:
REM     scripts\install_tiles.bat <zip-url-or-local-path>
REM  Examples:
REM     scripts\install_tiles.bat https://github.com/<owner>/<repo>/releases/download/tiles-v1/mapapp-tiles-raster.zip
REM     scripts\install_tiles.bat D:\share\mapapp-tiles-raster.zip
REM
REM  The archive must contain a "raster" folder at its root - exactly what
REM  release\mapapp-tiles-raster.zip contains (created on the machine that
REM  fetched the tiles first).
REM
REM  No argument? Fetch from the source instead:  scripts\fetch_tiles.bat
REM ============================================================================
setlocal EnableExtensions
chcp 65001 >nul 2>&1
call "%~dp0env.bat"

if "%~1"=="" (
  echo [INFO] usage: scripts\install_tiles.bat ^<zip-url-or-local-path^>
  echo.
  echo        fetch from source instead :  scripts\fetch_tiles.bat
  echo        local package ^(if built^) :  release\mapapp-tiles-raster.zip
  echo        published package         :  https://github.com/soft-monk/smart-mission-system/releases/download/tiles-v1/mapapp-tiles-raster.zip
  exit /b 1
)

set "SRC=%~1"
set "TMP=%TEMP%\mapapp-tiles-download.zip"

echo %SRC% | findstr /i "^https:// ^http://" >nul
if errorlevel 1 goto local

echo [1/3] downloading archive ...
curl.exe -L --retry 3 --retry-delay 2 --retry-all-errors -o "%TMP%" "%SRC%"
if errorlevel 1 ( echo [FAIL] download failed & exit /b 1 )
set "ARCHIVE=%TMP%"
goto extract

:local
if not exist "%SRC%" ( echo [FAIL] file not found: %SRC% & exit /b 1 )
echo [1/3] using local archive ...
set "ARCHIVE=%SRC%"

:extract
echo [2/3] extracting into tiles\ ...
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%ARCHIVE%' -DestinationPath '%MAPAPP_ROOT%\tiles' -Force"
if errorlevel 1 ( echo [FAIL] extraction failed & exit /b 1 )
if /i "%ARCHIVE%"=="%TMP%" del "%TMP%" >nul 2>&1

echo [3/3] verifying ...
set "N=0"
for /f %%c in ('dir /b /s "%MAPAPP_ROOT%\tiles\raster\*.jpg" 2^>nul ^| find /c /v ""') do set "N=%%c"
echo       tiles now: %N% jpg files
echo.
echo done. restart the backend so it picks up the new tiles.
exit /b 0
