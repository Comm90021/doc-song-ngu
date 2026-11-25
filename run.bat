@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not defined DSN_PORT set "DSN_PORT=8765"
set "DSN_URL=http://127.0.0.1:%DSN_PORT%"
call :ping
if not errorlevel 1 goto open
if not exist web\vendor (
  call npm run vendor
  if errorlevel 1 (
    echo Không chuẩn bị được thư viện. Kiểm tra node_modules và Node.js.
    pause
    exit /b 1
  )
)
start "Đọc Song Ngữ (đóng cửa sổ này để tắt)" /min py -3 pc\server.py
powershell -NoProfile -Command "$end=[datetime]::UtcNow.AddSeconds(5); do {try {if((Invoke-RestMethod '%DSN_URL%/api/ping' -TimeoutSec 1).app -eq 'docsongngu'){exit 0}}catch{}; Start-Sleep -Milliseconds 150} while([datetime]::UtcNow -lt $end);exit 1"
if errorlevel 1 (
  echo Không kết nối được máy chủ.
  pause
  exit /b 1
)
:open
start "" msedge --app=%DSN_URL%/
exit /b 0
:ping
powershell -NoProfile -Command "try {if((Invoke-RestMethod '%DSN_URL%/api/ping' -TimeoutSec 1).app -eq 'docsongngu'){exit 0}}catch{};exit 1"
exit /b %errorlevel%
