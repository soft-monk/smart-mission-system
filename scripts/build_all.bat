@echo off
REM ============================================================================
REM  智能任务管理系统 · 一键构建（前端 + C++ 后端）
REM  说明：本脚本在 cmd 中清掉大小写重复的代理变量后再调用编译器。
REM        原因：若环境中同时存在 NO_PROXY 与 no_proxy，.NET 的环境字典会因
REM        大小写不敏感而抛 "已添加项" 异常，导致 MSBuild/CL.exe 直接失败。
REM ============================================================================
setlocal

set "HTTP_PROXY="
set "HTTPS_PROXY="
set "http_proxy="
set "https_proxy="
set "NO_PROXY="
set "no_proxy="
set "NODE_USE_ENV_PROXY="

set "ROOT=%~dp0"
set "CMAKE=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
if not exist "%CMAKE%" set "CMAKE=cmake"
set "VCPKG_TOOLCHAIN=C:/vcpkg/scripts/buildsystems/vcpkg.cmake"

echo.
echo [1/3] 构建前端 ...
pushd "%ROOT%frontend"
call npm install
if errorlevel 1 ( echo [FAIL] 前端依赖安装失败 & popd & exit /b 1 )
call npx tsc --noEmit
if errorlevel 1 ( echo [FAIL] 前端类型检查失败 & popd & exit /b 1 )
call npx vite build
if errorlevel 1 ( echo [FAIL] 前端构建失败 & popd & exit /b 1 )
popd
echo       前端产物 -> backend\static

echo.
echo [2/3] 配置 C++ 后端（vcpkg manifest）...
"%CMAKE%" -S "%ROOT%backend" -B "%ROOT%backend\build" -G "Visual Studio 17 2022" -A x64 ^
  -DCMAKE_TOOLCHAIN_FILE="%VCPKG_TOOLCHAIN%" -DVCPKG_TARGET_TRIPLET=x64-windows
if errorlevel 1 ( echo [FAIL] CMake 配置失败 & exit /b 1 )

echo.
echo [3/3] 编译 C++ 后端 ...
"%CMAKE%" --build "%ROOT%backend\build" --config Release --parallel %NUMBER_OF_PROCESSORS%
if errorlevel 1 ( echo [FAIL] 后端编译失败 & exit /b 1 )

echo.
echo ============================================================
echo  构建完成
echo    后端可执行 : backend\bin\Release\mapapp.exe
echo    前端产物   : backend\static\
echo  启动：scripts\start_all.bat
echo ============================================================
exit /b 0
