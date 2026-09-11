@echo off
REM ============================================================================
REM  mapApp environment doctor - report detected toolchain and what is missing
REM  Run this FIRST on any new machine:  scripts\doctor.bat
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

echo ============================================================
echo  mapApp environment doctor
echo ============================================================
echo  repo root          : %MAPAPP_ROOT%
echo  CMake              : %MAPAPP_CMAKE%
echo  CMake generator    : %MAPAPP_CMAKE_GENERATOR%  (empty = let CMake decide)
echo  vcpkg root         : %MAPAPP_VCPKG_ROOT%
echo  vcpkg toolchain    : %MAPAPP_VCPKG_TOOLCHAIN%
echo  Python launcher    : %MAPAPP_PYTHON%
echo  Node               : %MAPAPP_NODE%
echo  ports              : HTTP=%MAPAPP_HTTP_PORT%  AI=%MAPAPP_AI_PORT%
echo ------------------------------------------------------------

set "MISSING=0"

if defined MAPAPP_CMAKE (
  "%MAPAPP_CMAKE%" --version 2>nul | findstr /r "version" >nul && echo  [OK]   CMake usable
) else (
  echo  [MISS] CMake not found.
  echo         Fix: install CMake or VS2022 with "Desktop development with C++",
  echo              or pin it in scripts\env.local.bat  ^(MAPAPP_CMAKE=...^)
  set "MISSING=1"
)

if exist "%MAPAPP_VCPKG_TOOLCHAIN%" (
  echo  [OK]   vcpkg toolchain found
) else (
  echo  [MISS] vcpkg not found.
  echo         Fix A: run  scripts\install_vcpkg.bat   ^(clones + bootstraps vcpkg^)
  echo         Fix B: set VCPKG_ROOT, or write the path into scripts\env.local.bat:
  echo                set "MAPAPP_VCPKG_ROOT=D:\path\to\vcpkg"
  set "MISSING=1"
)

if defined MAPAPP_PYTHON (
  %MAPAPP_PYTHON% --version 2>nul
  echo  [OK]   Python launcher: %MAPAPP_PYTHON%
) else (
  echo  [MISS] Python 3.10+ not found. Install it, or pin MAPAPP_PYTHON in env.local.bat
  set "MISSING=1"
)

if defined MAPAPP_NODE (
  for /f "delims=" %%v in ('node -v 2^>nul') do echo  [OK]   Node %%v
) else (
  echo  [MISS] Node.js not found. Install Node 18+ and rerun.
  set "MISSING=1"
)

if exist "%MAPAPP_ROOT%\ai\.venv\Scripts\python.exe" (
  echo  [OK]   AI bridge venv exists
) else (
  echo  [INFO] ai\.venv missing - run  scripts\setup_env.bat  ^(or it is created on first start^)
)

if exist "%MAPAPP_ROOT%\frontend\node_modules" (
  echo  [OK]   frontend node_modules present
) else (
  echo  [INFO] frontend\node_modules missing - run  scripts\setup_env.bat  or  scripts\build_all.bat
)

if exist "%MAPAPP_ROOT%\backend\bin\Release\mapapp.exe" (
  echo  [OK]   backend binary built
) else (
  echo  [INFO] backend not built yet - run  scripts\build_all.bat
)

REM tiles (not a build blocker: the map falls back to a solid colour)
set "TILECNT=0"
for /f %%c in ('dir /b /s "%MAPAPP_ROOT%\tiles\raster\*.jpg" 2^>nul ^| find /c /v ""') do set "TILECNT=%%c"
if "%TILECNT%"=="0" (
  echo  [INFO] tiles\raster is empty - fetch once with:  py -3.12 scripts\fetch_tiles.py
) else (
  echo  [OK]   tiles present: %TILECNT% jpg files
)

echo ------------------------------------------------------------
if "%MISSING%"=="1" (
  echo  RESULT: required toolchain incomplete - see [MISS] items above.
  exit /b 1
)
echo  RESULT: required toolchain OK. Next: scripts\setup_env.bat then scripts\build_all.bat
exit /b 0
