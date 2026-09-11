@echo off
REM ============================================================================
REM  Publish the map-2d module to its own repository (subtree split + push)
REM
REM  Usage:
REM     scripts\publish-map2d.bat                    -> soft-monk/map-2d (create if missing)
REM     scripts\publish-map2d.bat <git-remote-url>   -> push to the given remote
REM
REM  How it works: `git subtree split --prefix=map-2d` builds a branch that
REM  contains only this module's history; the main repo layout is untouched.
REM  Re-run this script whenever you want to sync the sub-repo.
REM ============================================================================
setlocal EnableExtensions
call "%~dp0env.bat"

if not "%~1"=="" (
  set "TARGET=%~1"
) else (
  set "TARGET=https://github.com/soft-monk/map-2d.git"
)

pushd "%MAPAPP_ROOT%"

echo [1/4] checking working tree ...
git diff --quiet || (echo       [WARN] uncommitted changes exist - the split uses committed content only)

echo [2/4] splitting subtree map-2d ...
git subtree split --prefix=map-2d -b map2d-publish
if errorlevel 1 ( echo [FAIL] subtree split failed & popd & exit /b 1 )

echo [3/4] ensuring target repository exists: %TARGET%
echo %TARGET% | findstr /i "github.com" >nul
if not errorlevel 1 (
  gh repo view soft-monk/map-2d >nul 2>&1
  if errorlevel 1 (
    echo       creating public repo soft-monk/map-2d ...
    gh repo create soft-monk/map-2d --public --description "二维地图绘制模块（MapLibre + React）：渲染 + API 驱动，可嵌入式使用，也可独立启动" >nul
    if errorlevel 1 echo       [WARN] repo create failed - will try to push anyway
  )
)

echo [4/4] pushing to %TARGET% ...
git push "%TARGET%" map2d-publish:main --force
if errorlevel 1 ( echo [FAIL] push failed & popd & exit /b 1 )

git branch -D map2d-publish >nul 2>&1
popd

echo.
echo ============================================================
echo  published. clone it anywhere with:
echo     git clone %TARGET%
echo     cd map-2d ^(or the repo folder^) ^&^& npm install ^&^& npm run dev
echo ============================================================
exit /b 0
