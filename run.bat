@echo off
title YouTube RVX - Morphe Manager WebUI
cd /d "%~dp0"
call "%~dp0start.bat" %*
if %errorlevel% neq 0 (
    echo.
    echo [!] Server berhenti dengan kode %errorlevel%.
    pause
)
