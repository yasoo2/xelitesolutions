# joe-secrets.example.ps1  ->  copy to  joe-secrets.ps1  and fill in your keys.
# joe-secrets.ps1 is gitignored: never uploaded to GitHub, never wiped by git pull.
# Keep the VALUES in plain ASCII (English/numbers). Then run .\start-joe.ps1.

# --- Groq (FREE, fast cloud brain: Llama 3.3 70B) — RECOMMENDED for weak laptops ---
# Get a free key (no card): https://console.groq.com  ->  API Keys  ->  Create.
# Paste it below (starts with gsk_). When set, Groq becomes Joe's PRIMARY brain
# and the browser agent runs smart + instant, even on a CPU-only machine.
$env:GROQ_API_KEY = "gsk_PASTE_YOUR_GROQ_KEY_HERE"

# --- Google (Gmail / Calendar / Drive) ---
$env:GOOGLE_CLIENT_ID = "PASTE_CLIENT_ID_HERE.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET = "PASTE_CLIENT_SECRET_HERE"

# --- Add other secrets later if needed ---
# $env:OPENAI_API_KEY = "..."
