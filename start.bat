@echo off
rem Double-click to start the English app on this computer.
cd /d "%~dp0"
title English App Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\server.ps1" -Port 8000
pause
