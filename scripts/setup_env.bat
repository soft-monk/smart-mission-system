@echo off
REM ============================================================================
REM  One-time per-machine setup: Python venv for the AI bridge + frontend deps
REM  Safe to re-run; it skips work that is already done.
REM ============================================================================
setlocal EnableExtensions
chcp 65001 >nul 2>&1
call "%~dp0env.bat"

set "VENV_PY=%MAPAPP_ROOT%\ai\.venv\Scripts\python.exe"

echo [1/2] Python AI bridge environment ...
if not defined MAPAPP_PYTHON (
  echo [FAIL] Python 3.10+ not found. Install Python, or pin MAPAPP_PYTHON in scripts\env.local.bat
  exit /b 1
)
if exist "%VENV_PY%" (
  echo       venv already present: %VENV_PY%
) else (
  echo       creating venv with: %MAPAPP_PYTHON%
  pushd "%MAPAPP_ROOT%\ai"
  %MAPAPP_PYTHON% -m venv ".venv"
  if errorlevel 1 ( echo [FAIL] venv creation failed & popd & exit /b 1 )
  popd
)
echo       installing requirements ...
"%VENV_PY%" -m pip install --disable-pip-version-check -q -r "%MAPAPP_ROOT%\ai\requirements.txt"
if errorlevel 1 ( echo [FAIL] pip install failed. Check network / proxy, then rerun. & exit /b 1 )
echo       AI bridge environment ready.

echo.
echo [2/2] frontend dependencies ...
pushd "%MAPAPP_ROOT%\frontend"
if exist node_modules (
  echo       node_modules already present
) else (
  call npm install
  if errorlevel 1 ( echo [FAIL] npm install failed. Check network / npm registry. & popd & exit /b 1 )
)
popd
echo       frontend dependencies ready.

echo.
echo ============================================================
echo  setup complete. next:
echo    scripts\build_all.bat     build frontend + C++ backend
echo    scripts\start_all.bat     start AI bridge + backend
echo ============================================================
exit /b 0
