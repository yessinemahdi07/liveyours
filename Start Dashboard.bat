@echo off
title LiveYours
color 0D
echo ===================================================
echo   LAUNCHING JACK OF ALL TRADES COMMAND CENTER
echo ===================================================

:: 1. Start OmniRoute
echo [1/3] Starting OmniRoute Gateway...
start /min powershell -WindowStyle Minimized -Command "omniroute"
timeout /t 5 /nobreak >nul

:: 2. Start Cloudflare Tunnel (Remote Access)
echo [2/3] Starting Secure Public Tunnel...
echo.
echo ===================================================
echo CHECK THE NEW WINDOW FOR YOUR REMOTE HTTPS URL
echo (It will look like: https://random-words.trycloudflare.com)
echo ===================================================
echo.
start "Cloudflare Tunnel - Remote Access" cmd /k "cd /d %~dp0 && cloudflared.exe tunnel --url http://localhost:5000"

:: 3. Start Flask Server
echo [3/3] Starting Local Dashboard Server...
cd /d "%~dp0"
start /min python app.py

:: 4. Open Browser
timeout /t 3 /nobreak >nul
start http://localhost:5000

echo.
echo Dashboard is running locally!
echo Keep this window and the Cloudflare window open to stay online.
pause
