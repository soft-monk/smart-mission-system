@echo off
REM ============================================================================
REM  Build the C++ backend only (frontend untouched).
REM  Configures automatically when backend\build is missing or stale.
REM  Toolchain paths come from ..\scripts\env.bat / env.local.bat
REM ============================================================================
setlocal EnableExtensions
call "%~dp0..\scripts\env.bat"

if not defined MAPAPP_CMAKE (
  echo [FAIL] CMake not found. Run scripts\doctor.bat for details.
  exit /b 1
)
if not exist "%MAPAPP_VCPKG_TOOLCHAIN%" (
  echo [FAIL] vcpkg toolchain not found. Run scripts\install_vcpkg.bat once.
  exit /b 1
)

if not exist "%~dp0build\CMakeCache.txt" (
  echo [build] configuring ...
  set "GEN_ARGS="
  if defined MAPAPP_CMAKE_GENERATOR set "GEN_ARGS=-G "%MAPAPP_CMAKE_GENERATOR%""
  "%MAPAPP_CMAKE%" -S "%~dp0" -B "%~dp0build" %GEN_ARGS% ^
    -DCMAKE_TOOLCHAIN_FILE="%MAPAPP_VCPKG_TOOLCHAIN%" -DVCPKG_TARGET_TRIPLET=x64-windows
  if errorlevel 1 ( echo [FAIL] configure failed & exit /b 1 )
)

echo [build] compiling Release ...
"%MAPAPP_CMAKE%" --build "%~dp0build" --config Release --parallel %NUMBER_OF_PROCESSORS%
set "RC=%ERRORLEVEL%"
echo [build] exit=%RC%
exit /b %RC%
