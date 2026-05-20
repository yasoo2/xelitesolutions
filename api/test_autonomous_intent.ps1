# Test script for Phase 3 Autonomy
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJyb2xlIjoiT1dORVIiLCJlbWFpbCI6ImRldkBqb2UubG9jYWwiLCJuYW1lIjoiRGV2ZWxvcGVyIiwiaWF0IjoxNzc4NDQxOTMxLCJleHAiOjE3NzkwNDY3MzF9.OlLASgfHUo9tenXGiRB9UC_OEyKabpEUcKyRp2aFjjY"
}

# 1. Create a session
$sessionRes = Invoke-RestMethod -Uri "http://localhost:8080/api/sessions" -Method Post -Headers $headers -Body (@{ name = "Phase 3 Test"; kind = "agent" } | ConvertTo-Json)
$sessionId = $sessionRes._id
Write-Host "Session created: $sessionId"

# 2. Add Message
$body = @{ content = "Build a full react dashboard with a user list and a sidebar then run tests to ensure it works" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/api/sessions/$sessionId/message" -Method Post -Headers $headers -Body $body

# 3. Trigger Run
$runBody = @{
    text = "Build a full react dashboard with a user list and a sidebar then run tests to ensure it works"
    sessionId = $sessionId
} | ConvertTo-Json

Write-Host "Triggering autonomous run..."
$runRes = Invoke-RestMethod -Uri "http://localhost:8080/api/run/start" -Method Post -Headers $headers -Body $runBody

Write-Host "Response received. RunID: $($runRes.runId)"
Write-Host "Checking logs for AutonomousOrchestrator delegation..."
Start-Sleep -Seconds 5
