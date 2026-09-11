@echo off
REM ============================================================================
REM  Install vcpkg (only needed once per machine, only when it is missing)
REM  Clones to %USERPROFILE%\vcpkg by default; override with:
REM     set "MAPAPP_VCPKG_ROOT=<target>"   in scripts\env.local.bat
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

if exist "%MAPAPP_VCPKG_TOOLCHAIN%" (
  echo [OK] vcpkg already available: %MAPAPP_VCPKG_ROOT%
  echo      nothing to do.
  exit /b 0
)

if defined MAPAPP_VCPKG_ROOT (
  set "TARGET=%MAPAPP_VCPKG_ROOT%"
) else (
  set "TARGET=%USERPROFILE%\vcpkg"
)

echo [1/3] cloning vcpkg into "%TARGET%" ...
if not exist "%TARGET%\.git" (
  git clone --depth 1 https://github.com/microsoft/vcpkg "%TARGET%"
  if errorlevel 1 (
    echo [FAIL] git clone failed. Check network / proxy, then rerun.
    exit /b 1
  )
) else (
  echo       already cloned, skipping
)

echo [2/3] bootstrapping vcpkg ...
call "%TARGET%\bootstrap-vcpkg.bat" -disableMetrics
if errorlevel 1 (
  echo [FAIL] bootstrap failed.
  exit /b 1
)

echo [3/3] verifying toolchain file ...
if not exist "%TARGET%\scripts\buildsystems\vcpkg.cmake" (
  echo [FAIL] toolchain file missing after bootstrap.
  exit /b 1
)

echo.
echo ============================================================
echo  vcpkg ready: %TARGET%
echo  If doctor.bat still reports it as missing, write this into
echo  scripts\env.local.bat :
echo      set "MAPAPP_VCPKG_ROOT=%TARGET%"
echo ============================================================
exit /b 0
