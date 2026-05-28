@echo off
chcp 65001 >nul
REM ดับเบิลคลิกไฟล์นี้ หรือเปิด Command Prompt ในโฟลเดอร์ student check
cd /d "%~dp0"
echo โฟลเดอร์: %CD%
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org then try again.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Starting dev server — watch the URL below (often http://localhost:5173/)
call npm run dev
pause
