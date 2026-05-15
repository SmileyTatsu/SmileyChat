@echo off
setlocal
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
  echo Bun is required to run SmileyChat.
  echo Install Bun, then run this file again.
  pause
  exit /b 1
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
echo Open http://127.0.0.1:4173 in your browser.
bun run start

pause
