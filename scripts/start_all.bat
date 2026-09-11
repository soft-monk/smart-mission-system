@echo off
REM ============================================================================
REM  mapApp - start AI bridge + C++ backend
REM  Browsers:  http://127.0.0.1:<HTTP_PORT>/   and   http://<lan-ip>:<HTTP_PORT>/
REM  Stop with: scripts\stop_all.bat
REM
REM  Both services are launched through their own wrapper scripts so that the
REM  console code page (chcp 65001) and runtime dirs are set consistently.
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

set "SRV=%MAPAPP_ROOT%\backend\bin\Release\mapapp.exe"

if not exist "%SRV%" (
  echo [FAIL] backend binary not found: %SRV%
  echo        run scripts\build_all.bat first ^(see scripts\doctor.bat^)
  exit /b 1
)

REM runtime dirs used by config.json relative paths
if not exist "%MAPAPP_ROOT%\backend\data"         mkdir "%MAPAPP_ROOT%\backend\data"
if not exist "%MAPAPP_ROOT%\backend\data\reports" mkdir "%MAPAPP_ROOT%\backend\data\reports"

echo [1/2] starting Python AI bridge on 127.0.0.1:%MAPAPP_AI_PORT% ...
echo       ^(first run creates ai\.venv and installs dependencies^)
start "mapapp-ai" cmd /c ""%MAPAPP_ROOT%\ai\run_bridge.bat" --port %MAPAPP_AI_PORT%"

timeout /t 3 /nobreak >nul

echo [2/2] starting C++ backend on %MAPAPP_HTTP_PORT% ...
start "mapapp-server" cmd /c ""%MAPAPP_ROOT%\backend\run_server.bat""

timeout /t 3 /nobreak >nul

echo.
echo ============================================================
echo  running. open in browser:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo    http://%%b:%MAPAPP_HTTP_PORT%/
)
echo    http://127.0.0.1:%MAPAPP_HTTP_PORT%/
echo.
echo  health    : http://127.0.0.1:%MAPAPP_HTTP_PORT%/api/v1/health
echo  websocket : ws://127.0.0.1:%MAPAPP_HTTP_PORT%/ws
echo  logs      : backend\data\server.out.log  /  server.err.log
echo ============================================================
exit /b 0
