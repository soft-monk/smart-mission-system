@echo off
REM 在 cmd 中清掉大小写重复的代理变量（.NET 环境字典大小写敏感，重复键会让 MSBuild 崩）
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "http_proxy="
set "https_proxy="
set "NO_PROXY="
set "no_proxy="
set "NODE_USE_ENV_PROXY="

set "CMAKE=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
set "BE=%~dp0"

echo [build] configuring (if needed) and building Release...
"%CMAKE%" --build "%BE%build" --config Release --parallel %NUMBER_OF_PROCESSORS%
set "RC=%ERRORLEVEL%"
echo [build] exit=%RC%
exit /b %RC%
