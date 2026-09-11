@echo off
REM ============================================================================
REM  Run the backend in the foreground (Ctrl+C to stop), logging to data\.
REM  Working dir is backend\ because config.json uses relative paths.
REM ============================================================================
setlocal EnableExtensions
chcp 65001 >nul 2>&1
call "%~dp0..\scripts\env.bat"

cd /d "%~dp0"
if not exist "data"         mkdir "data"
if not exist "data\reports" mkdir "data\reports"

if not exist "%~dp0bin\Release\mapapp.exe" (
  echo [FAIL] backend binary not found: %~dp0bin\Release\mapapp.exe
  echo        run scripts\build_all.bat or backend\build_release.bat first
  exit /b 1
)

echo [run] backend on port %MAPAPP_HTTP_PORT%  (logs: data\server.out.log / server.err.log)
"%~dp0bin\Release\mapapp.exe" --port %MAPAPP_HTTP_PORT% > "%~dp0data\server.out.log" 2> "%~dp0data\server.err.log"
exit /b %ERRORLEVEL%
