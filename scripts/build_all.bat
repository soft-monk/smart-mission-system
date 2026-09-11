@echo off
REM ============================================================================
REM  mapApp - one-shot build (frontend + C++ backend)
REM  ASCII-only output on purpose: batch messages must not depend on code pages.
REM  Machine paths come from env.bat / env.local.bat - never hard-coded here.
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

if not defined MAPAPP_CMAKE (
  echo [FAIL] CMake not found.
  echo        Install CMake or Visual Studio 2022 with "Desktop development with C++",
  echo        or pin it in scripts\env.local.bat  ^(MAPAPP_CMAKE=...^)
  echo        Check everything with: scripts\doctor.bat
  exit /b 1
)

if not exist "%MAPAPP_VCPKG_TOOLCHAIN%" (
  echo [FAIL] vcpkg toolchain not found: "%MAPAPP_VCPKG_TOOLCHAIN%"
  echo        Install it once with:  scripts\install_vcpkg.bat
  echo        or point MAPAPP_VCPKG_ROOT to your vcpkg in scripts\env.local.bat
  echo        Check everything with: scripts\doctor.bat
  exit /b 1
)

echo.
echo [1/3] building frontend ...
pushd "%MAPAPP_ROOT%\frontend"
if not exist node_modules (
  echo       installing npm dependencies ...
  call npm install
  if errorlevel 1 ( echo [FAIL] npm install failed & popd & exit /b 1 )
)
call npm run build
if errorlevel 1 ( echo [FAIL] frontend build failed & popd & exit /b 1 )
popd
echo       frontend output -> backend\static

echo.
echo [2/3] configuring C++ backend ...
set "GEN_ARGS="
if defined MAPAPP_CMAKE_GENERATOR set "GEN_ARGS=-G "%MAPAPP_CMAKE_GENERATOR%""
"%MAPAPP_CMAKE%" -S "%MAPAPP_ROOT%\backend" -B "%MAPAPP_ROOT%\backend\build" %GEN_ARGS% ^
  -DCMAKE_TOOLCHAIN_FILE="%MAPAPP_VCPKG_TOOLCHAIN%" -DVCPKG_TARGET_TRIPLET=x64-windows
if errorlevel 1 ( echo [FAIL] CMake configure failed & exit /b 1 )

echo.
echo [3/3] compiling C++ backend (first run builds vcpkg dependencies) ...
"%MAPAPP_CMAKE%" --build "%MAPAPP_ROOT%\backend\build" --config Release --parallel %NUMBER_OF_PROCESSORS%
if errorlevel 1 ( echo [FAIL] backend build failed & exit /b 1 )

echo.
echo ============================================================
echo  build complete
echo    backend exe : backend\bin\Release\mapapp.exe
echo    frontend    : backend\static\
echo  next: scripts\start_all.bat
echo ============================================================
exit /b 0
