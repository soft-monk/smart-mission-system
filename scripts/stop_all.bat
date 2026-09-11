@echo off
REM ============================================================================
REM  mapApp - stop AI bridge + C++ backend
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

echo stopping backend ...
taskkill /FI "WINDOWTITLE eq mapapp-server*" /F >nul 2>&1
taskkill /IM mapapp.exe /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%MAPAPP_HTTP_PORT%" ^| findstr "LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
)

echo stopping AI bridge ...
taskkill /FI "WINDOWTITLE eq mapapp-ai*" /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%MAPAPP_AI_PORT%" ^| findstr "LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
)

echo done.
exit /b 0
