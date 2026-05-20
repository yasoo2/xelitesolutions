@echo off
echo [JOE] Starting automatic update push...
git add .
git commit -m "fix: comprehensive deployment fixes and auto-pop logs"
git push origin main
echo [JOE] Updates pushed successfully!
pause
