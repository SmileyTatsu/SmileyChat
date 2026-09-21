@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\.."

where bun >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.bun\bin\bun.exe" (
    set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
  ) else (
    echo Bun is required to run SmileyChat, but it was not found on your system.
    echo SmileyChat can download and install Bun to "%USERPROFILE%\.bun" via https://bun.sh.
    set /p INSTALL_BUN="Do you want to download and install Bun now? (Y/N): "
    if /I "!INSTALL_BUN!"=="Y" (
      powershell -NoProfile -ExecutionPolicy Bypass -c "irm bun.sh/install.ps1 | iex"
      if errorlevel 1 (
        echo Failed to install Bun. Please install it manually from https://bun.sh
        pause
        exit /b 1
      )
      set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
    ) else (
      echo Please install Bun manually from https://bun.sh
      pause
      exit /b 1
    )
  )
)

if not exist node_modules (
  echo Required dependencies (node_modules) are not installed.
  set /p INSTALL_DEPS="Do you want to install dependencies now using Bun? (Y/N): "
  if /I "!INSTALL_DEPS!"=="Y" (
    echo Installing dependencies...
    bun install
    if errorlevel 1 (
      pause
      exit /b 1
    )
  ) else (
    echo Cannot run SmileyChat without installed dependencies.
    pause
    exit /b 1
  )
)

if not exist dist\index.html (
  echo Building SmileyChat frontend...
  bun run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo Starting SmileyChat...
bun run start

pause
