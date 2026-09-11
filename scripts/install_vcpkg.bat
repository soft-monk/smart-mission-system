@echo off
REM ============================================================================
REM  Ensure a usable vcpkg checkout (idempotent - re-run any time)
REM
REM  Steps:
REM    1) clone if missing  (FULL clone: manifest baselines need git history)
REM    2) repair shallow clones from older versions of this script
REM    3) bootstrap vcpkg.exe
REM    4) verify the CMake toolchain file
REM
REM  Target dir: MAPAPP_VCPKG_ROOT (env.local.bat) else %USERPROFILE%\vcpkg
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

if defined MAPAPP_VCPKG_ROOT (
  set "TARGET=%MAPAPP_VCPKG_ROOT%"
) else (
  set "TARGET=%USERPROFILE%\vcpkg"
)

echo [1/4] checking vcpkg checkout at "%TARGET%" ...
if exist "%TARGET%\scripts\buildsystems\vcpkg.cmake" (
  echo       checkout present
) else (
  if exist "%TARGET%\.git" (
    echo       dir exists but is incomplete - removing and re-cloning
    rmdir /s /q "%TARGET%"
  )
  echo       cloning ^(full clone, no --depth: baselines need history^) ...
  git clone https://github.com/microsoft/vcpkg "%TARGET%"
  if errorlevel 1 (
    echo [FAIL] git clone failed. Check network / proxy, then rerun.
    exit /b 1
  )
)

echo [2/4] checking git history depth ...
set "SHALLOW="
for /f "delims=" %%s in ('git -C "%TARGET%" rev-parse --is-shallow-repository 2^>nul') do set "SHALLOW=%%s"
if /i "%SHALLOW%"=="true" (
  echo       shallow clone detected - fetching full history ^(manifest baseline^) ...
  git -C "%TARGET%" fetch --unshallow --tags
  if errorlevel 1 (
    echo [FAIL] git fetch --unshallow failed. Check network / proxy, then rerun.
    exit /b 1
  )
) else (
  echo       history complete
)

echo [3/4] bootstrapping vcpkg ...
if exist "%TARGET%\vcpkg.exe" (
  echo       vcpkg.exe present
) else (
  call "%TARGET%\bootstrap-vcpkg.bat" -disableMetrics
  if errorlevel 1 (
    echo [FAIL] bootstrap failed.
    exit /b 1
  )
)

echo [4/4] verifying CMake toolchain file ...
if not exist "%TARGET%\scripts\buildsystems\vcpkg.cmake" (
  echo [FAIL] toolchain file missing after setup.
  exit /b 1
)

echo.
echo ============================================================
echo  vcpkg ready: %TARGET%
echo  If doctor.bat reports it as missing, add this to
echo  scripts\env.local.bat :
echo      set "MAPAPP_VCPKG_ROOT=%TARGET%"
echo ============================================================
exit /b 0
