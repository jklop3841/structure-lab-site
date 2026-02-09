$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = '情报采集自动化 - 剪贴板监听器'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host '=========================================='
Write-Host ' 情报采集自动化 - 剪贴板监听器正在运行'
Write-Host ' [目标目录]: D:\AI\vault'
Write-Host ' [使用方法]: 在浏览器全选并复制 AI 回答'
Write-Host '=========================================='

node .\scripts\automation\clipboard_harvester.mjs

Write-Host ''
Write-Host '进程已退出，按回车关闭窗口...'
Read-Host | Out-Null


