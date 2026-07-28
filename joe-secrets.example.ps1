# joe-secrets.example.ps1  ->  copy to  joe-secrets.ps1  and fill in your keys.
# joe-secrets.ps1 is gitignored: never uploaded to GitHub, never wiped by git pull.
# Keep the VALUES in plain ASCII (English/numbers). Then run .\start-joe.ps1.

# --- Google (Gmail / Calendar / Drive) ---
$env:GOOGLE_CLIENT_ID = "PASTE_CLIENT_ID_HERE.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET = "PASTE_CLIENT_SECRET_HERE"

# --- Add other secrets later if needed ---
# $env:OPENAI_API_KEY = "..."
# $env:GROQ_API_KEY = "..."
