@echo off
REM ============================================================
REM  start-joe.bat - تشغيل Joe محلياً على المنفذ 5002 (ويندوز)
REM  بلا مفتاح: يعمل على الذكاء المجاني (LLM7 / Pollinations)
REM  الاستخدام: انقر نقراً مزدوجاً على هذا الملف
REM ============================================================
setlocal
cd /d "%~dp0"

REM --- الوضع المحلي أحادي المستخدم (بلا قاعدة بيانات وبلا تسجيل دخول) ---
set PORT=5002
set JWT_SECRET=dev-secret-joe-local
set PERSISTENCE_MODE=JSON
set MOCK_DB=true
set ENABLE_AUTH_BYPASS=true
set AUTO_APPROVE_ALL=1
set NODE_ENV=development

echo ============================================
echo   JOE - Local Free-AI Mode (no API key)
echo   http://localhost:5002/joe
echo ============================================

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js is not installed. Install it from https://nodejs.org then retry.
  pause
  exit /b 1
)

cd api

if not exist node_modules (
  echo.
  echo [1/3] Installing dependencies (first run only, may take a few minutes)...
  call npm install --no-audit --no-fund --legacy-peer-deps
  if errorlevel 1 ( echo [X] npm install failed. & pause & exit /b 1 )
) else (
  echo [1/3] Dependencies already installed.
)

echo.
echo [2/3] Building API...
call npm run build
if errorlevel 1 ( echo [X] Build failed. & pause & exit /b 1 )
echo [2/3] API built OK

:run
echo.
echo [3/3] Starting Joe  ->  http://localhost:5002/joe   (press Ctrl+C to stop)
node dist\index.js
echo.
echo [!] Joe stopped. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto run
