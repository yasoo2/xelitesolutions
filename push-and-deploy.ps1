# Joe Autonomous Platform - 1-Click Push & Deploy Script
# Run this script in PowerShell to push your local updates to GitHub and deploy them to the server instantly.

Clear-Host
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "🚀 STARTING JOE AUTONOMOUS PUSH & DEPLOYMENT" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# Ensure we are in the correct root directory
$apiDir = Join-Path $PSScriptRoot "api"

if (-Not (Test-Path $apiDir)) {
    Write-Host "❌ Error: Could not find 'api' directory. Please ensure this script is run from the workspace root." -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    Exit
}

# 1. Navigate to api folder and stage changes
cd $apiDir
Write-Host "Staging files..." -ForegroundColor Yellow
git add src/kernel/ExecutionEngine.ts src/kernel/ExecutionGateway.ts src/orchestration/AgentExecutionFirewall.ts src/modules/services/ToolService.ts src/api/routes/git.ts src/api/routes/packages.ts src/api/routes/admin.ts src/api/routes/project.ts src/api/routes/ping-deploy.ts

# 2. Commit changes
Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m "arch: implement pure deterministic single brain execution and stateless firewall"

# 3. Push to GitHub
Write-Host "Pushing to GitHub origin main..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Code successfully pushed to GitHub!" -ForegroundColor Green
    
    # 4. Trigger Server Deployment via Webhook
    Write-Host "Triggering Server Deployment via Webhook..." -ForegroundColor Yellow
    $deployUrl = "https://www.xelitesolutions.com/api/ping-deploy"
    
    try {
        $response = Invoke-RestMethod -Uri $deployUrl -Method Get -TimeoutSec 30
        Write-Host "🎉 Server Deployment Triggered Successfully!" -ForegroundColor Green
        Write-Host "Deployment Response: $($response | ConvertTo-Json -Depth 5)" -ForegroundColor Cyan
    } catch {
        Write-Host "⚠️ Warning: Failed to trigger webhook automatically: $_" -ForegroundColor Yellow
        Write-Host "Please manually visit: $deployUrl in your browser to deploy." -ForegroundColor White
    }

    # 5. Open deploy URL in browser to see logs
    Write-Host "Opening deployment link in browser..." -ForegroundColor Yellow
    Start-Process $deployUrl
} else {
    Write-Host "`n❌ Error: Failed to push to GitHub. Please check your credentials or git status." -ForegroundColor Red
}

Write-Host "`nDone!" -ForegroundColor Green
Read-Host "Press Enter to exit..."
