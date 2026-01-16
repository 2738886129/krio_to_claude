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
    echo [提示] 首次运行，正在安装后端依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 后端依赖安装失败
        pause
        exit /b 1
    )
    echo [成功] 后端依赖安装完成
    echo.
)

:: 检查前端 node_modules 是否存在
if not exist "public\node_modules" (
    echo [提示] 正在安装前端依赖...
    cd public
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 前端依赖安装失败
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo [成功] 前端依赖安装完成
    echo.
)

:: 打包前端项目
echo [提示] 正在打包前端项目...
cd public
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 前端打包失败
    cd ..
    pause
    exit /b 1
)
cd ..
echo [成功] 前端打包完成
echo.

:: 启动服务器
echo [启动] 正在启动服务器...
node src/claude-api-server.js

if %errorlevel% neq 0 (
    echo.
    echo [错误] 服务器异常退出，错误代码: %errorlevel%
    pause
)
