@echo off
title 情报采集自动化 - 剪贴板监听器
cd /d "%~dp0"
echo ==========================================
echo    情报采集自动化 - 剪贴板监听器正在运行
echo    [目标目录]: D:\AI\vault
echo    [使用方法]: 在浏览器全选并复制 AI 回答
echo ==========================================
node .\scripts\automation\clipboard_harvester.mjs
pause

