@echo off
chcp 65001 >nul
title Kiro Proxy Server

:: 切换到脚本所在目录
cd /d "%~dp0"

:: 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [成功] 依赖安装完成
    echo.
)

:: 自动重启循环
:start
echo [启动] 正在启动服务器...
node src/claude-api-server.js
set exitcode=%errorlevel%

:: 退出码 0 表示正常重启请求
if %exitcode% equ 0 (
    echo.
    echo [重启] 服务器请求重启，3 秒后重新启动...
    timeout /t 3 /nobreak >nul
    goto start
)

:: 其他退出码表示异常
echo.
echo [错误] 服务器异常退出，错误代码: %exitcode%
pause
