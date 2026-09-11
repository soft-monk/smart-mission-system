@echo off
REM ============================================================================
REM  Publish the map-2d module to its own repository (subtree split + push)
REM
REM  Usage:
REM     scripts\publish-map2d.bat                    -- push to soft-monk/map-2d
REM     scripts\publish-map2d.bat ^<git-remote-url^>   -- push to the given remote
REM
REM  Notes:
REM    * uses "git subtree split --prefix=map-2d"; the main repo layout is untouched
REM    * re-run this script whenever you want to sync the sub-repo
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

set "TARGET=https://github.com/soft-monk/map-2d.git"
if not "%~1"=="" set "TARGET=%~1"

pushd "%MAPAPP_ROOT%"

echo [1/3] splitting subtree map-2d ...
git subtree split --prefix=map-2d -b map2d-publish
if errorlevel 1 goto fail

echo [2/3] ensuring target repository exists ...
echo %TARGET% | findstr /i "github.com" >nul
if errorlevel 1 goto push

gh repo view soft-monk/map-2d >nul 2>&1
if not errorlevel 1 goto push

echo       creating public repo soft-monk/map-2d ...
gh repo create soft-monk/map-2d --public --description "二维地图绘制模块 MapLibre + React：渲染 + API 驱动，可嵌入式使用，也可独立启动"
if errorlevel 1 echo       [WARN] repo create failed - trying to push anyway

:push
echo [3/3] pushing to %TARGET% ...
git push "%TARGET%" map2d-publish:main --force
if errorlevel 1 goto fail

git branch -D map2d-publish >nul 2>&1
popd
echo.
echo ============================================================
echo  published. clone it anywhere with:
echo     git clone %TARGET%
echo     then: npm install   and   npm run dev
echo ============================================================
exit /b 0

:fail
echo [FAIL] publish failed - see messages above
git branch -D map2d-publish >nul 2>&1
popd
exit /b 1
