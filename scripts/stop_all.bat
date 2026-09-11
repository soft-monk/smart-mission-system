@echo off
REM ============================================================================
REM  mapApp - stop AI bridge + C++ backend  (SAFE MODE)
REM
REM  Safety rules (added after an unrelated process was killed on this machine):
REM    * ports are validated to be numeric; if not, fall back - never use an
REM      empty pattern, which would match EVERY listening port
REM    * a process is killed only after BOTH checks pass:
REM        1) image name is mapapp.exe / python.exe / pythonw.exe
REM        2) for python: its command line points inside this repo
REM    * window-title based kills were removed (a title filter can match
REM      unrelated consoles, e.g. the DSH/agent shell)
REM    * node.exe and everything else is never touched
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

call :numeric "%MAPAPP_HTTP_PORT%" PORT_HTTP
call :numeric "%MAPAPP_AI_PORT%"   PORT_AI
if not defined PORT_HTTP ( echo [WARN] MAPAPP_HTTP_PORT invalid - using 8080 & set "PORT_HTTP=8080" )
if not defined PORT_AI   ( echo [WARN] MAPAPP_AI_PORT invalid - using 8090 & set "PORT_AI=8090" )

echo [1/2] stopping C++ backend on port %PORT_HTTP% ...
call :kill_port %PORT_HTTP% mapapp.exe

echo [2/2] stopping Python AI bridge on port %PORT_AI% ...
call :kill_port %PORT_AI% python

echo done.
exit /b 0

REM ---------------------------------------------------------------------------
REM  :numeric <value> <outvar>   -> sets outvar only when value is all digits
:numeric
set "%~2="
if "%~1"=="" exit /b 0
for /f "delims=0123456789" %%i in ("%~1") do exit /b 0
set "%~2=%~1"
exit /b 0

REM ---------------------------------------------------------------------------
REM  :kill_port <port> <expected-image-prefix>
:kill_port
set "KP_PORT=%~1"
set "KP_WANT=%~2"
set "KP_ANY="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%KP_PORT% " ^| findstr "LISTENING"') do call :kill_verified %%p
if not defined KP_ANY echo       nothing listening on %KP_PORT%
exit /b 0

REM ---------------------------------------------------------------------------
REM  :kill_verified <pid>  - image + repo-path check before killing
:kill_verified
set "KV_PID=%~1"
if "%KV_PID%"=="" exit /b 0
set "KV_IMG="
for /f "tokens=1 delims=," %%i in ('tasklist /FI "PID eq %KV_PID%" /FO CSV /NH 2^>nul') do set "KV_IMG=%%~i"
if not defined KV_IMG exit /b 0
set "KP_ANY=1"
if /i "%KV_IMG%"=="mapapp.exe" goto :kv_kill
if /i "%KV_IMG%"=="python.exe"  goto :kv_check_py
if /i "%KV_IMG%"=="pythonw.exe" goto :kv_check_py
echo       skip PID %KV_PID% ^(%KV_IMG%^) - not a mapapp process
exit /b 0

:kv_check_py
set "KV_CMD="
for /f "usebackq delims=" %%c in (`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=%KV_PID%').CommandLine" 2^>nul`) do set "KV_CMD=%%c"
if not defined KV_CMD (
  echo       skip PID %KV_PID% ^(python, command line unknown^)
  exit /b 0
)
echo %KV_CMD% | findstr /i /c:"%MAPAPP_ROOT%" >nul
if errorlevel 1 (
  echo       skip PID %KV_PID% ^(python outside this repo^)
  exit /b 0
)

:kv_kill
echo       killing %KV_IMG% PID %KV_PID%
taskkill /PID %KV_PID% /F >nul 2>&1
exit /b 0
