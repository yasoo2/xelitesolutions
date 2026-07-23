@echo off
REM ============================================================
REM  start-joe.bat - run Joe locally on port 5002 (Windows)
REM  No API key: runs on FREE AI (LLM7 / Pollinations)
REM  Usage: double-click this file
REM ============================================================
setlocal
cd /d "%~dp0"

REM --- Local single-user mode (no database, no login) ---
set PORT=5002
set JWT_SECRET=dev-secret-joe-local
set PERSISTENCE_MODE=JSON
set MOCK_DB=true
set ENABLE_AUTH_BYPASS=true
set AUTO_APPROVE_ALL=1
set NODE_ENV=development

echo ============================================
echo   JOE - Local Free-AI Mode - no API key
echo   http://localhost:5002/joe
echo ============================================

where node >nul 2>nul
if errorlevel 1 goto no_node

cd api

if exist node_modules goto do_build
echo.
echo [1/3] Installing dependencies - first run only - may take a few minutes...
call npm install --no-audit --no-fund --legacy-peer-deps
if errorlevel 1 goto install_failed
goto do_build

:do_build
echo.
echo [2/3] Building API...
call npm run build
if errorlevel 1 goto build_failed
echo [2/3] API built OK

:run
echo.
echo [3/3] Starting Joe  --  http://localhost:5002/joe   - press Ctrl+C to stop
node dist\index.js
echo.
echo [!] Joe stopped. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto run

:no_node
echo [X] Node.js is not installed. Install it from https://nodejs.org then retry.
pause
exit /b 1

:install_failed
echo [X] npm install failed. See the errors above.
pause
exit /b 1

:build_failed
echo [X] Build failed. See the errors above.
pause
exit /b 1
