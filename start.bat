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

:: 启动服务器
node src/claude-api-server.js

:: 如果服务器退出，暂停显示错误
if %errorlevel% neq 0 (
    echo.
    echo [错误] 服务器异常退出，错误代码: %errorlevel%
    pause
)
