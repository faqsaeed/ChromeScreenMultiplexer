@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "NODE_PATH_FILE=%SCRIPT_DIR%.node-path"

if not exist "%NODE_PATH_FILE%" (
  echo Native host is not configured. Run setup-windows.ps1 again. 1>&2
  exit /b 1
)

set "NODE_BIN="
set /p NODE_BIN=<"%NODE_PATH_FILE%"

if not exist "%NODE_BIN%" (
  echo Configured Node.js executable is unavailable. Run setup-windows.ps1 again. 1>&2
  exit /b 1
)

"%NODE_BIN%" "%SCRIPT_DIR%host.mjs"
exit /b %ERRORLEVEL%
