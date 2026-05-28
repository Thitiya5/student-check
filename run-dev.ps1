# ดับเบิลคลิกไม่ได้ — คลิกขวา > Run with PowerShell
# หรือใน Terminal:  powershell -ExecutionPolicy Bypass -File .\run-dev.ps1

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host "โฟลเดอร์โปรเจกต์: $PWD" -ForegroundColor Cyan

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command node)) {
  Write-Host "[ERROR] ไม่พบ Node.js" -ForegroundColor Red
  Write-Host "ติดตั้ง LTS จาก https://nodejs.org แล้วปิด-เปิด Terminal ใหม่"
  Read-Host "กด Enter เพื่อปิด"
  exit 1
}

if (-not (Test-Command npm)) {
  Write-Host "[ERROR] ไม่พบ npm (มักมากับ Node.js)" -ForegroundColor Red
  Read-Host "กด Enter เพื่อปิด"
  exit 1
}

Write-Host "Node: $(node -v)  npm: $(npm -v)" -ForegroundColor Green

if (-not (Test-Path "package.json")) {
  Write-Host "[ERROR] ไม่พบ package.json — เปิด Terminal ในโฟลเดอร์ student check" -ForegroundColor Red
  Read-Host "กด Enter เพื่อปิด"
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "กำลัง npm install ..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install ล้มเหลว (exit $LASTEXITCODE)" -ForegroundColor Red
    Read-Host "กด Enter เพื่อปิด"
    exit $LASTEXITCODE
  }
}

Write-Host ""
Write-Host "กำลังเปิดเซิร์ฟเวอร์ — เปิดเบราว์เซอร์ที่ URL ด้านล่าง (มักเป็น http://localhost:5173/)" -ForegroundColor Green
Write-Host "กด Ctrl+C เพื่อหยุด" -ForegroundColor DarkGray
Write-Host ""

npm run dev
