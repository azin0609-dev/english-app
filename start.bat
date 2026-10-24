@echo off
rem Double-click to start the investment dashboard on this computer.
cd /d "%~dp0"
title Invest Dashboard Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\server.ps1" -Port 8001
pause
