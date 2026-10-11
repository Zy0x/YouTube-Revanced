@echo off
setlocal enabledelayedexpansion
title YouTube RVX - Morphe Manager WebUI

:: Always run in script's directory
cd /d "%~dp0"

echo =====================================================================
echo           YouTube RVX - Morphe Manager ^& Revancify-Xisr
echo                     Local Web Server Launcher
echo =====================================================================
echo.

:: Locate daemon binary (prefer release, fallback to debug)
set "DAEMON_EXE="
if exist "daemon\target\release\rvx-daemon.exe" (
    set "DAEMON_EXE=daemon\target\release\rvx-daemon.exe"
) else if exist "daemon\target\debug\rvx-daemon.exe" (
    set "DAEMON_EXE=daemon\target\debug\rvx-daemon.exe"
)

:: If binary does not exist, attempt to compile via cargo
if not defined DAEMON_EXE (
    echo [!] Binary rvx-daemon.exe not found.
    where cargo >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Rust/Cargo is not installed or not in PATH.
        echo Please install Rust from https://rustup.rs/ to compile the daemon.
        echo.
        pause
        exit /b 1
    )
    echo [*] Compiling rvx-daemon in release mode, please wait...
    cargo build --release --manifest-path daemon\Cargo.toml
    if %errorlevel% neq 0 (
        echo [ERROR] Compilation failed.
        pause
        exit /b 1
    )
    set "DAEMON_EXE=daemon\target\release\rvx-daemon.exe"
)

:: Detect primary LAN IPv4 address for mobile/WiFi testing
set "LAN_IP="
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' -and $_.IPAddress -notlike '169.254*' } | Select-Object -First 1).IPAddress" 2^>nul`) do (
    set "LAN_IP=%%i"
)

set "PORT=8080"
set "BIND_ADDR=0.0.0.0"

echo [i] Daemon binary : %DAEMON_EXE%
echo [i] Bind address  : %BIND_ADDR% (LAN ^& Localhost accessible)
echo [i] Port          : %PORT%
echo.
echo =====================================================================
echo   Akses WebUI di Browser:
echo     - Komputer / PC   : http://localhost:%PORT%  atau  http://127.0.0.1:%PORT%
if defined LAN_IP (
echo     - HP / WiFi LAN   : http://%LAN_IP%:%PORT%
)
echo =====================================================================
echo.
echo [i] Membuka browser default dalam 2 detik...
echo [i] Tekan Ctrl+C di jendela ini untuk mematikan web server.
echo.

:: Launch browser in background after short delay
start /b "" cmd /c "ping 127.0.0.1 -n 3 >nul && start http://localhost:%PORT%"

:: Execute daemon
"%DAEMON_EXE%" --bind %BIND_ADDR% --port %PORT% --modpath "%~dp0."

if %errorlevel% neq 0 (
    echo.
    echo [!] Daemon terminated with exit code %errorlevel%.
    pause
)
