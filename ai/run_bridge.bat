@echo off
rem =====================================================================================
rem  Smart Mission System - Python AI bridge launcher (Windows)
rem  Creates/reuses ai\.venv, installs requirements.txt when needed, then starts bridge.py.
rem  Listening address: 127.0.0.1:8090 (see ai\config.json; local-only per contract S1).
rem  Extra args are forwarded to bridge.py, e.g. run_bridge.bat --port 8090 --log-level DEBUG
rem =====================================================================================
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set "VENV_PY=%~dp0.venv\Scripts\python.exe"

if exist "!VENV_PY!" goto deps

set "PYEXE="
where py >nul 2>&1 && set "PYEXE=py -3"
if not defined PYEXE (
  where python >nul 2>&1
  if not errorlevel 1 set "PYEXE=python"
)
if not defined PYEXE (
  echo [ERROR] Python 3.11 x64 not found in PATH. Install it, then rerun this script.
  exit /b 1
)

echo [1/3] Creating virtual environment .venv with "!PYEXE!" ...
!PYEXE! -m venv ".venv"
if errorlevel 1 (
  echo [ERROR] Failed to create .venv
  exit /b 1
)

:deps
echo [2/3] Checking dependencies ^(fastapi / uvicorn / httpx / python-multipart^) ...
"!VENV_PY!" -c "import fastapi, uvicorn, httpx, multipart" >nul 2>&1
if errorlevel 1 (
  echo       Installing -r requirements.txt ...
  "!VENV_PY!" -m pip install --disable-pip-version-check -r "requirements.txt"
  if errorlevel 1 (
    echo [ERROR] pip install failed. Check network / HTTP_PROXY, then rerun.
    exit /b 1
  )
)

echo [3/3] Starting AI bridge ... press Ctrl+C to stop
echo       health : http://127.0.0.1:8090/health
echo       docs   : http://127.0.0.1:8090/docs
"!VENV_PY!" "bridge.py" %*
exit /b !errorlevel!
