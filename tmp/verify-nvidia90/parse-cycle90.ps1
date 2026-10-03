# Cycle-90 independent verification parser (Muse cycle-191). Read-only: parses the
# NVIDIA cycle-90 log, extracts npm-run set, jest summaries, PASS/FAIL lines,
# and the closing claim block. No NVIDIA-tree writes, no executions there.
$log = 'D:\Joe\coordination\logs\nvidia-2026-10-03_09-55-34-cycle-90.log'
$out = 'D:\Joe\muse-worktree\tmp\verify-nvidia90'
$raw = [IO.File]::ReadAllText($log)  # auto-detects UTF-16LE BOM
$clean = $raw -replace "`e\[[0-9;?]*[a-zA-Z]", '' -replace "`e[()][0-9A-Z]", ''
$lines = $clean -split "`r?`n"
"TOTAL_LINES=$($lines.Count) TOTAL_CHARS=$($clean.Length)" | Out-File "$out\meta-cycle90.txt"

# 1. Unique npm run invocations
$npmRuns = $lines | Select-String 'npm run ([a-z0-9:._-]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Sort-Object -Unique
"UNIQUE_NPM_RUNS:" | Out-File "$out\npm-runs-cycle90.txt"
$npmRuns | Out-File "$out\npm-runs-cycle90.txt" -Append

# 2. All jest summary lines with line numbers
$lines | Select-String 'Tests:|Test Suites:|PASS |FAIL |EXIT|exited' | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" } | Out-File "$out\gate-lines-cycle90.txt"

# 3. npx/jest direct invocations
$lines | Select-String '(npx jest|jest\.cmd|node_modules/.bin/jest)' | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" } | Out-File "$out\jest-invocations-cycle90.txt"

# 4. Self-fix family mentions
$lines | Select-String 'self-fix|self_fix|selffix|typescript-repair|typescript-missing|typescript-number|typescript-string|typescript-boolean|typescript-argument|build-context|execution-safety' | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" } | Out-File "$out\selffix-lines-cycle90.txt"

# 5. Full cleaned log for closing-block inspection
$clean | Out-File "$out\cycle90-clean.txt" -Encoding utf8
Write-Host "done lines=$($lines.Count)"
Write-Host "--- npm runs ---"; $npmRuns
