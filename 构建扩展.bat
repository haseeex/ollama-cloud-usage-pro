@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo    Ollama Cloud Usage - 构建扩展
echo ============================================
echo.

REM ── 检查 Node.js ──
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装: https://nodejs.org/
    goto :fail
)
for /f "delims=" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
echo [1/4] Node.js 版本: %NODE_VER%

REM ── 安装依赖 ──
if exist "node_modules" (
    echo [2/4] 依赖已存在，跳过 npm install
) else (
    echo [2/4] 正在安装依赖 ^(npm install^)...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        goto :fail
    )
)

REM ── 编译 TypeScript ──
echo [3/4] 正在编译 TypeScript...
call npm run compile
if errorlevel 1 (
    echo [错误] 编译失败
    goto :fail
)

REM ── 打包 VSIX ──
echo [4/4] 正在打包 VSIX ^(vsce package^)...
call npx --yes @vscode/vsce package
if errorlevel 1 (
    echo [错误] 打包失败
    goto :fail
)

echo.
echo ============================================
echo    构建成功！生成的 VSIX 文件:
echo ============================================
for %%f in (*.vsix) do echo    %%f  ^(%%~zf 字节^)
echo.
echo 安装方法（任选其一）:
echo   1. 命令行: code --install-extension ^<上面的文件名^>
echo   2. VS Code 扩展面板 -^> 右上角 "..." -^> 从 VSIX 安装
echo.
goto :done

:fail
echo.
echo 构建未完成，请根据上方错误信息排查。

:done
if /i "%~1"=="nopause" exit /b 0
echo %CMDCMDLINE% | findstr /i /c:"/c" >nul
if not errorlevel 1 pause
exit /b 0
