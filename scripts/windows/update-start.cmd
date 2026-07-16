@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\.."

where git >nul 2>nul
if errorlevel 1 (
  echo Git is required to update SmileyChat.
  echo Install Git, then run this file again.
  pause
  exit /b 1
)

where bun >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.bun\bin\bun.exe" (
    set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
  ) else (
    echo Bun is required to run SmileyChat, but it was not found.
    set /p INSTALL_BUN="Do you want to install Bun now? (Y/N): "
    if /I "!INSTALL_BUN!"=="Y" (
      powershell -c "irm bun.sh/install.ps1 | iex"
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

if not exist .git (
  echo This folder is not a Git checkout.
  echo Clone SmileyChat with Git before using this update script.
  pause
  exit /b 1
)

echo Updating SmileyChat...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Update failed. If you have local changes, commit or stash them first.
  pause
  exit /b 1
)

echo Installing dependencies...
bun install
if errorlevel 1 (
  pause
  exit /b 1
)

echo Building SmileyChat...
bun run build
if errorlevel 1 (
  pause
  exit /b 1
)

echo Starting SmileyChat...
bun run start

pause
