# Muse independent rerun of the updated Receive-TeamReviews.ps1 (exact bytes, isolated dirs).
# Reads the shared script read-only; ALL writes go under $Work (Muse tmp). No shared mutation.
# NOTE: $Work is a SUBDIR of this script's folder, so the clean step never deletes this harness.
param([string]$Work = 'D:\Joe\muse-worktree\tmp\receiver-rerun-20261003\run')
$ErrorActionPreference = 'Stop'
$Script = 'D:\Joe\coordination\team\runtime\Receive-TeamReviews.ps1'
$FixDir = 'D:\Joe\coordination\team\verification\receiver-review-fixes-20261003T013731313'

# 0. Pin exact reviewed bytes
$scriptHash = (Get-FileHash -LiteralPath $Script -Algorithm SHA256).Hash
"SCRIPT_SHA256=$scriptHash"

# 1. Parser check (PSParser, syntax errors only)
$tokens = $null; $errors = $null
[void][System.Management.Automation.PSParser]::Tokenize((Get-Content -LiteralPath $Script -Raw), [ref]$errors)
"PARSER_ERRORS=$($errors.Count)"
foreach ($e in $errors) { "PARSER_ERROR: $($e.Message)" }

# 2. Build isolated roots
$muse = Join-Path $Work 'muse'; $nvidia = Join-Path $Work 'nvidia'; $team = Join-Path $Work 'team'
Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $muse, $nvidia, $team -Force | Out-Null
Copy-Item (Join-Path $FixDir 'muse\*.response.md') $muse -Force
Copy-Item (Join-Path $FixDir 'nvidia\*.response.md') $nvidia -Force
# Extra Muse negative pins (F5 header anchoring + wrong-root swap)
@'
AGENT=MUSE
STATUS=REVIEWED_BY_MUSE
Quoting another agent:
```
AGENT=NVIDIA
```
'@ | Set-Content (Join-Path $muse 'QUOTED-001-MUSE.response.md') -Encoding utf8
@'
AGENT=MUSE
AGENT=MUSE
STATUS=REVIEWED_BY_MUSE
'@ | Set-Content (Join-Path $muse 'MULTI-002-MUSE.response.md') -Encoding utf8
(@('filler line') * 24 + @('AGENT=MUSE', 'STATUS=REVIEWED_BY_MUSE') -join "`n") | Set-Content (Join-Path $muse 'LATE-003-MUSE.response.md') -Encoding utf8
@'
AGENT=MUSE
STATUS=REVIEWED_BY_MUSE
'@ | Set-Content (Join-Path $nvidia 'SWAPPED-004-MUSE.response.md') -Encoding utf8

# 3. One-shot isolated run
$out = & $Script -TeamRoot $team -SourceRoots $muse, $nvidia -SourceAgents 'MUSE', 'NVIDIA'
$idx = Get-Content -LiteralPath (Join-Path $team 'received-reviews\index.json') -Raw | ConvertFrom-Json
"RECEIPT_ONLY=$($idx.receiptOnly)"
foreach ($r in $idx.reviews) { "DISP name=$($r.name) agent=$($r.agent) disp=$($r.disposition)" }

# 4. Expectation check
$expect = @{
  'TEST-001-MUSE' = 'RECEIVED_PENDING_CODEX_AUDIT'
  'TEST-002-NVIDIA' = 'RECEIVED_PENDING_CODEX_AUDIT'
  'TEST-003-NVIDIA.response.md' = 'REJECTED_ATTRIBUTION'
  'test-004-muse.response.md' = 'REJECTED_ATTRIBUTION'
  'QUOTED-001-MUSE.response.md' = 'REJECTED_ATTRIBUTION'
  'MULTI-002-MUSE.response.md' = 'REJECTED_ATTRIBUTION'
  'LATE-003-MUSE.response.md' = 'REJECTED_ATTRIBUTION'
  'SWAPPED-004-MUSE.response.md' = 'REJECTED_ATTRIBUTION'
}
$fail = 0
foreach ($r in $idx.reviews) {
  $want = $expect[$r.name]
  if ($r.disposition -ne $want) { "MISMATCH name=$($r.name) got=$($r.disposition) want=$want"; $fail++ }
}
if ($idx.reviews.Count -ne $expect.Count) { "COUNT_MISMATCH got=$($idx.reviews.Count) want=$($expect.Count)"; $fail++ }
# sourceRoot recorded on accepted rows (F1 provenance)
foreach ($r in ($idx.reviews | Where-Object { $_.disposition -eq 'RECEIVED_PENDING_CODEX_AUDIT' })) {
  if (-not $r.sourceRoot) { "MISSING_SOURCEROOT name=$($r.name)"; $fail++ }
}
"RERUN_FAILS=$fail"

# 5. Lease test: hold lock, one-shot must fail; release, must succeed (F2 pin)
$lockPath = Join-Path $team 'received-reviews\collector.lock'
$held = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
try {
  & $Script -TeamRoot $team -SourceRoots $muse, $nvidia -SourceAgents 'MUSE', 'NVIDIA' | Out-Null
  "LEASE_HELD_RUN=UNEXPECTED_SUCCESS"; $fail++
} catch { "LEASE_HELD_RUN=FAILED_AS_EXPECTED" }
finally { $held.Dispose() }
& $Script -TeamRoot $team -SourceRoots $muse, $nvidia -SourceAgents 'MUSE', 'NVIDIA' | Out-Null
"LEASE_RELEASED_RUN=SUCCESS"
"FINAL_FAILS=$fail"
if ($fail -ne 0) { exit 1 }
"INDEPENDENT_RERUN=PASS"
