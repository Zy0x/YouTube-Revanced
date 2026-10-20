@echo off
setlocal enabledelayedexpansion
title YouTube RVX - Morphe Manager WebUI

:: Always run in script's directory
cd /d "%~dp0"

:: Terminate any stale rvx-daemon process to free port 8088 and release binary file locks
taskkill /f /im rvx-daemon.exe >nul 2>&1

echo =====================================================================
echo           YouTube RVX - Morphe Manager and Revancify-Xisr
echo                     Local Web Server Launcher
echo =====================================================================
echo.

:: Check for Rust/Cargo to guarantee binary is always compiled and up to date
set "DAEMON_EXE="
where cargo >nul 2>&1
if not errorlevel 1 (
    echo [*] Memeriksa dan mengompilasi rvx-daemon...
    cargo build --release --manifest-path daemon\Cargo.toml
    if not errorlevel 1 (
        if exist "daemon\target\release\rvx-daemon.exe" (
            set "DAEMON_EXE=daemon\target\release\rvx-daemon.exe"
        )
    )
)

:: If cargo is not available or build was skipped, select newest existing binary
if not defined DAEMON_EXE (
    if exist "daemon\target\release\rvx-daemon.exe" (
        set "DAEMON_EXE=daemon\target\release\rvx-daemon.exe"
    ) else if exist "daemon\target\debug\rvx-daemon.exe" (
        set "DAEMON_EXE=daemon\target\debug\rvx-daemon.exe"
    ) else (
        echo [ERROR] Binary rvx-daemon.exe tidak ditemukan dan Rust/Cargo tidak ada di PATH.
        echo Silakan pasang Rust dari https://rustup.rs/ untuk mengompilasi daemon.
        echo.
        pause
        exit /b 1
    )
)

set "PORT=8088"
set "BIND_ADDR=127.0.0.1"
set "MODPATH=%~dp0."

echo [i] Daemon binary : !DAEMON_EXE!
echo [i] Bind address  : %BIND_ADDR% - local device only
echo [i] Default port  : %PORT% - Dedicated RVX port
echo [i] Live Reload   : AKTIF - Perubahan folder web langsung live saat refresh!
echo.
echo =====================================================================
echo   Akses WebUI di Browser:
echo     - Komputer / PC   : http://localhost:%PORT%  atau  http://127.0.0.1:%PORT%
echo     - Perangkat lain  : salin web\rvx-local.html ke perangkat tersebut
echo =====================================================================
echo.
echo [i] Membuka browser default dalam 2 detik...
echo [i] Tekan Ctrl+C di jendela ini untuk mematikan web server.
echo.

:: Launch browser in background after short delay to allow daemon socket bind
start /b "" cmd /c "ping 127.0.0.1 -n 3 >nul & start http://localhost:%PORT%"

:: Execute daemon with exported MODPATH
"%DAEMON_EXE%" --bind %BIND_ADDR% --port %PORT% --modpath "%MODPATH%"

if %errorlevel% neq 0 (
    echo.
    echo [!] Daemon terminated with exit code %errorlevel%.
    pause
)
