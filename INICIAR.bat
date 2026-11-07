@echo off
cd /d "%~dp0"
title LemaClipper
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
node src\servidor.js
pause
