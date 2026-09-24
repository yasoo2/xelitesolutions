$body = @{
    text = "Build me a luxury perfume e-commerce store with scent notes, sizes, prices, cart, checkout, and order history."
    sessionId = "uat-test-1"
} | ConvertTo-Json -Depth 10

Invoke-WebRequest -Uri http://localhost:5000/api/runs/start -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing