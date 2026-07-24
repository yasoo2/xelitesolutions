@echo off
REM ============================================================
REM  start-joe.bat - run Joe locally on port 5002 (Windows)
REM  No API key: runs on FREE AI (local Ollama / keyless gateways)
REM  Builds BOTH the web UI and the API so updates always apply.
REM  Usage: double-click this file (or:  .\start-joe.bat )
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

REM --- Local Brain: point Joe at your local Ollama (free, keyless, offline) ---
REM Joe auto-detects your installed models, picks a fast chat model + the
REM strongest coding model, and warms them up on boot. If Ollama is not running
REM Joe simply falls back to the free keyless AI mesh - nothing breaks.
if not defined LOCAL_LLM_BASE_URL set LOCAL_LLM_BASE_URL=http://localhost:11434/v1
REM Give the local CPU model plenty of time on the first (cold) request.
if not defined LOCAL_LLM_TIMEOUT set LOCAL_LLM_TIMEOUT=180000

echo ============================================
echo   JOE - Local Free-AI Mode - no API key
echo   http://localhost:5002/joe
echo ============================================

where node >nul 2>nul
if errorlevel 1 goto no_node

REM ---------- WEB (frontend UI) ----------
cd web
if exist node_modules goto web_build
echo.
echo [1/4] Installing web dependencies - first run only - may take a few minutes...
call npm install --no-audit --no-fund --legacy-peer-deps
if errorlevel 1 goto web_install_failed

:web_build
echo.
echo [2/4] Building the web UI...
call npm run build
if errorlevel 1 goto web_build_failed
echo [2/4] Web UI built OK
cd ..

REM ---------- API (backend) ----------
cd api
if exist node_modules goto api_build
echo.
echo [3/4] Installing API dependencies - first run only - may take a few minutes...
call npm install --no-audit --no-fund --legacy-peer-deps
if errorlevel 1 goto api_install_failed

:api_build
echo.
echo [3/4] Building the API...
call npm run build
if errorlevel 1 goto api_build_failed
echo [3/4] API built OK

echo.
echo [3/4] Ensuring the browser engine (Chromium) is installed for Joe's browser...
call npx --yes playwright install chromium
echo [3/4] Browser engine ready

:run
echo.
echo [4/4] Starting Joe  --  http://localhost:5002/joe   - press Ctrl+C to stop
node dist\index.js
echo.
echo [!] Joe stopped. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto run

:no_node
echo [X] Node.js is not installed. Install it from https://nodejs.org then retry.
pause
exit /b 1

:web_install_failed
echo [X] Web npm install failed. See the errors above.
pause
exit /b 1

:web_build_failed
echo [X] Web build failed. See the errors above.
pause
exit /b 1

:api_install_failed
echo [X] API npm install failed. See the errors above.
pause
exit /b 1

:api_build_failed
echo [X] Build failed. See the errors above.
pause
exit /b 1
