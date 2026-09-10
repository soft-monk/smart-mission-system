@echo off
REM 启动后端（清掉大小写重复的代理变量，避免子进程环境异常）
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "http_proxy="
set "https_proxy="
set "NO_PROXY="
set "no_proxy="
set "NODE_USE_ENV_PROXY="

cd /d "%~dp0"
echo [run] starting mapapp.exe (debug ai=%MAPAPP_DEBUG_AI%) ...
"%~dp0bin\Release\mapapp.exe" > "%~dp0data\server.out.log" 2> "%~dp0data\server.err.log"
