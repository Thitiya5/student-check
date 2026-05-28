@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Student Check - ติดตั้ง dependencies
echo ========================================
echo.
echo โฟลเดอร์: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ผิดพลาด] ไม่พบ Node.js
  echo ดาวน์โหลดติดตั้ง: https://nodejs.org  (เลือก LTS)
  echo หลังติดตั้ง ปิด Cursor/Terminal แล้วเปิดใหม่
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ผิดพลาด] ไม่พบ npm
  pause
  exit /b 1
)

echo Node version:
node -v
echo npm version:
npm -v
echo.

if not exist "package.json" (
  echo [ผิดพลาด] ไม่พบ package.json
  echo ต้องรันไฟล์นี้ในโฟลเดอร์ "student check"
  pause
  exit /b 1
)

echo กำลัง npm install ...
call npm install
if errorlevel 1 (
  echo.
  echo [ผิดพลาด] npm install ไม่สำเร็จ
  echo ลอง: ลบโฟลเดอร์ node_modules แล้วรันใหม่
  pause
  exit /b 1
)

echo.
echo [สำเร็จ] ติดตั้งเสร็จแล้ว
echo ขั้นต่อไป: ดับเบิลคลิก run-dev.cmd หรือพิมพ์ npm run dev
pause
