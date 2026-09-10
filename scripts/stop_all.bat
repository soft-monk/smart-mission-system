@echo off
REM 智能任务管理系统 · 停止服务（AI 桥 + C++ 服务端）
setlocal
echo 停止 mapapp-server ...
taskkill /FI "WINDOWTITLE eq mapapp-server*" /F >nul 2>&1
taskkill /IM mapapp.exe /F >nul 2>&1

echo 停止 mapapp-ai ...
taskkill /FI "WINDOWTITLE eq mapapp-ai*" /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8090" ^| findstr "LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
)

echo 已停止。
exit /b 0
