@echo off
setlocal
cd /d "%~dp0"

where bun >nul 2>nul
if errorlevel 1 (
  echo Bun is required to run SmileyChat.
  echo Install Bun, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  bun install
  if errorlevel 1 (
    pause
    exit /b 1
  )
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
