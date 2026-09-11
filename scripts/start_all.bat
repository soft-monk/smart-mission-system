@echo off
REM ============================================================================
REM  mapApp - start AI bridge + C++ backend
REM  Browsers:  http://127.0.0.1:<HTTP_PORT>/   and   http://<lan-ip>:<HTTP_PORT>/
REM  Stop with: scripts\stop_all.bat   (safe mode: only kills mapapp/python in
REM                                     this repo, verified by image + path)
REM
REM  This script NEVER kills anything. If a port is already taken it reports the
REM  owner and exits, so you can decide what to do.
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

set "SRV=%MAPAPP_ROOT%\backend\bin\Release\mapapp.exe"

if not exist "%SRV%" (
  echo [FAIL] backend binary not found: %SRV%
  echo        run scripts\build_all.bat first ^(see scripts\doctor.bat^)
  exit /b 1
)

call :check_port %MAPAPP_HTTP_PORT% "C++ backend"
if errorlevel 1 exit /b 1
call :check_port %MAPAPP_AI_PORT% "AI bridge"
if errorlevel 1 exit /b 1

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

REM ---------------------------------------------------------------------------
REM  :check_port <port> <label>   -> errorlevel 1 when the port is already taken
:check_port
set "CP_PORT=%~1"
set "CP_LABEL=%~2"
set "CP_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%CP_PORT% " ^| findstr "LISTENING"') do set "CP_PID=%%p"
if not defined CP_PID exit /b 0
set "CP_IMG=unknown"
for /f "tokens=1 delims=," %%i in ('tasklist /FI "PID eq %CP_PID%" /FO CSV /NH 2^>nul') do set "CP_IMG=%%~i"
echo [FAIL] port %CP_PORT% for %CP_LABEL% is already in use by PID %CP_PID% ^(%CP_IMG%^)
echo        - leftover mapapp process?   run scripts\stop_all.bat
echo        - something else?            free the port, or set another one in
echo                                     scripts\env.local.bat  ^(MAPAPP_HTTP_PORT / MAPAPP_AI_PORT^)
exit /b 1
