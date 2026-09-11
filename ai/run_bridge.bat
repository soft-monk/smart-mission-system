@echo off
REM ============================================================================
REM  Smart Mission System - Python AI bridge launcher
REM  Creates/reuses ai\.venv, installs requirements.txt when needed, starts bridge.py
REM  Listen address: 127.0.0.1:%MAPAPP_AI_PORT% (ai\config.json; local only)
REM  Extra args are forwarded, e.g. run_bridge.bat --log-level DEBUG
REM ============================================================================
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
call "%~dp0..\scripts\env.bat"
cd /d "%~dp0"

set "VENV_PY=%~dp0.venv\Scripts\python.exe"

if exist "!VENV_PY!" goto deps

if not defined MAPAPP_PYTHON (
  echo [ERROR] Python not found. Install Python 3.11/3.12 or pin MAPAPP_PYTHON in scripts\env.local.bat
  exit /b 1
)

echo [1/3] creating virtual environment .venv with "!MAPAPP_PYTHON!" ...
!MAPAPP_PYTHON! -m venv ".venv"
if errorlevel 1 (
  echo [ERROR] failed to create .venv
  exit /b 1
)

:deps
echo [2/3] checking dependencies fastapi / uvicorn / httpx / python-multipart ...
"!VENV_PY!" -c "import fastapi, uvicorn, httpx, multipart" >nul 2>&1
if errorlevel 1 (
  echo       installing -r requirements.txt ...
  "!VENV_PY!" -m pip install --disable-pip-version-check -r "requirements.txt"
  if errorlevel 1 (
    echo [ERROR] pip install failed. Check network / proxy, then rerun.
    exit /b 1
  )
)

echo [3/3] starting AI bridge ... press Ctrl+C to stop
echo       health : http://127.0.0.1:%MAPAPP_AI_PORT%/health
echo       docs   : http://127.0.0.1:%MAPAPP_AI_PORT%/docs
"!VENV_PY!" "bridge.py" %*
exit /b !errorlevel!
