@echo off
setlocal
title Farmer Pedro Offline Launcher
cd /d "%~dp0"

echo ===================================================
echo             Launching Farmer Pedro Offline
echo ===================================================
echo.
echo Opening index.html in your default browser...
start "" "%~dp0index.html"
echo.
echo Game launched! Have fun farming!
timeout /t 3 /nobreak >nul
exit /b 0
