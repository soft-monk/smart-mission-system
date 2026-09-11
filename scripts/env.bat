@echo off
REM ============================================================================
REM  mapApp shared environment detection
REM  - ASCII only: batch output must stay readable on any Windows code page
REM  - No machine-specific paths here; put those in scripts\env.local.bat
REM    (git-ignored, template: scripts\env.local.bat.example)
REM
REM  Usage from any script:   call "%~dp0env.bat"
REM
REM  Exports:
REM    MAPAPP_ROOT             repo root (absolute)
REM    MAPAPP_CMAKE            cmake.exe
REM    MAPAPP_VCPKG_ROOT       vcpkg checkout dir  (may be empty)
REM    MAPAPP_VCPKG_TOOLCHAIN  vcpkg.cmake         (may be empty)
REM    MAPAPP_PYTHON           python launcher, e.g. "py -3.12"
REM    MAPAPP_NODE             node.exe
REM    MAPAPP_HTTP_PORT        backend port   (default 8080)
REM    MAPAPP_AI_PORT          AI bridge port (default 8090)
REM
REM  NOTE: intentionally no "setlocal" - variables must survive in the caller.
REM ============================================================================

set "MAPAPP_ROOT=%~dp0.."
for %%I in ("%MAPAPP_ROOT%") do set "MAPAPP_ROOT=%%~fI"

REM ---- defaults (all overridable from env.local.bat) -------------------------
if not defined MAPAPP_HTTP_PORT       set "MAPAPP_HTTP_PORT=8080"
if not defined MAPAPP_AI_PORT         set "MAPAPP_AI_PORT=8090"
if not defined MAPAPP_CMAKE           set "MAPAPP_CMAKE="
if not defined MAPAPP_CMAKE_GENERATOR set "MAPAPP_CMAKE_GENERATOR="
if not defined MAPAPP_VCPKG_ROOT      set "MAPAPP_VCPKG_ROOT="
if not defined MAPAPP_VCPKG_TOOLCHAIN set "MAPAPP_VCPKG_TOOLCHAIN="
if not defined MAPAPP_PYTHON          set "MAPAPP_PYTHON="
if not defined MAPAPP_NODE            set "MAPAPP_NODE="

REM ---- machine-local overrides (never committed) -----------------------------
if exist "%~dp0env.local.bat" call "%~dp0env.local.bat"

REM ---- neutralise duplicated proxy variables ---------------------------------
REM  When both NO_PROXY and no_proxy exist, the .NET environment dictionary
REM  throws "item already added" and MSBuild / CL.exe fail immediately.
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "http_proxy="
set "https_proxy="
set "NO_PROXY="
set "no_proxy="
set "NODE_USE_ENV_PROXY="

REM ---- optional proxy re-injection for machines that need one ----------------
REM  Declare it once in scripts\env.local.bat, e.g.
REM      set "MAPAPP_HTTPS_PROXY=http://127.0.0.1:7897"
REM  vcpkg / pip / npm will then see a single, canonical proxy variable.
if defined MAPAPP_HTTP_PROXY  set "HTTP_PROXY=%MAPAPP_HTTP_PROXY%"
if defined MAPAPP_HTTPS_PROXY set "HTTPS_PROXY=%MAPAPP_HTTPS_PROXY%"
if defined MAPAPP_NO_PROXY    set "NO_PROXY=%MAPAPP_NO_PROXY%"

REM ---- CMake: override > PATH > Visual Studio bundled ------------------------
if not defined MAPAPP_CMAKE for /f "delims=" %%c in ('where cmake 2^>nul') do if not defined MAPAPP_CMAKE set "MAPAPP_CMAKE=%%c"
if not defined MAPAPP_CMAKE call :detect_vs_cmake

REM ---- vcpkg: override > VCPKG_ROOT > common locations ----------------------
if not defined MAPAPP_VCPKG_ROOT if defined VCPKG_ROOT set "MAPAPP_VCPKG_ROOT=%VCPKG_ROOT%"
if not defined MAPAPP_VCPKG_ROOT call :detect_vcpkg
if not defined MAPAPP_VCPKG_TOOLCHAIN if defined MAPAPP_VCPKG_ROOT set "MAPAPP_VCPKG_TOOLCHAIN=%MAPAPP_VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake"

REM ---- Python: override > 3.12 > 3.11 > 3.13 > 3.10 > py -3 > python --------
if not defined MAPAPP_PYTHON call :detect_python

REM ---- Node: override > PATH ------------------------------------------------
if not defined MAPAPP_NODE for /f "delims=" %%n in ('where node 2^>nul') do if not defined MAPAPP_NODE set "MAPAPP_NODE=%%n"

exit /b 0

REM ============================================================================
:detect_vs_cmake
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" exit /b 0
for /f "usebackq delims=" %%v in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
  if exist "%%v\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" set "MAPAPP_CMAKE=%%v\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
)
exit /b 0

REM ============================================================================
:detect_vcpkg
for %%p in ("C:\vcpkg" "D:\vcpkg" "%USERPROFILE%\vcpkg" "%LOCALAPPDATA%\vcpkg" "C:\dev\vcpkg" "D:\dev\vcpkg" "C:\tools\vcpkg") do (
  if not defined MAPAPP_VCPKG_ROOT if exist "%%~p\scripts\buildsystems\vcpkg.cmake" set "MAPAPP_VCPKG_ROOT=%%~p"
)
exit /b 0

REM ============================================================================
:detect_python
REM  Prefer 3.12/3.11: wheels for fastapi/pydantic are mature there.
for %%v in (3.12 3.11 3.13 3.10) do (
  if not defined MAPAPP_PYTHON (
    py -%%v --version >nul 2>&1
    if not errorlevel 1 set "MAPAPP_PYTHON=py -%%v"
  )
)
if not defined MAPAPP_PYTHON (
  py -3 --version >nul 2>&1
  if not errorlevel 1 set "MAPAPP_PYTHON=py -3"
)
if not defined MAPAPP_PYTHON (
  python --version >nul 2>&1
  if not errorlevel 1 set "MAPAPP_PYTHON=python"
)
exit /b 0
