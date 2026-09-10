@echo off
REM ============================================================================
REM  智能任务管理系统 · 一键启动（AI 桥 + C++ 服务端）
REM  启动后浏览器访问 http://<本机内网IP>:8080/
REM  停止：scripts\stop_all.bat
REM ============================================================================
setlocal

set "HTTP_PROXY="
set "HTTPS_PROXY="
set "http_proxy="
set "https_proxy="
set "NO_PROXY="
set "no_proxy="
set "NODE_USE_ENV_PROXY="

set "ROOT=%~dp0.."
set "PY=%ROOT%\ai\.venv\Scripts\python.exe"
set "SRV=%ROOT%\backend\bin\Release\mapapp.exe"

if not exist "%SRV%" (
  echo [FAIL] 未找到 %SRV%
  echo        请先运行 scripts\build_all.bat
  exit /b 1
)

echo [1/2] 启动 Python AI 桥（127.0.0.1:8090）...
if exist "%PY%" (
  pushd "%ROOT%\ai"
  start "mapapp-ai" /min "%PY%" bridge.py
  popd
) else (
  echo       [WARN] 未找到 ai\.venv，跳过 AI 桥（/api/v1/ai/* 将返回 code=2001 降级）
)

timeout /t 2 /nobreak >nul

echo [2/2] 启动 C++ 服务端（0.0.0.0:8080）...
pushd "%ROOT%\backend"
start "mapapp-server" /min "%SRV%"
popd

timeout /t 3 /nobreak >nul

echo.
echo ============================================================
echo  已启动。访问地址：
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo    http://%%b:8080/
)
echo    http://127.0.0.1:8080/
echo.
echo  健康检查 : http://127.0.0.1:8080/api/v1/health
echo  WebSocket: ws://127.0.0.1:8080/ws
echo ============================================================
exit /b 0
