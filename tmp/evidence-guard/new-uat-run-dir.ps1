# CreateNew-style guard for Joe UAT evidence directories.
#
# Usage (from D:\Joe\muse-worktree):
#   .\tmp\evidence-guard\new-uat-run-dir.ps1 -Name 'uat-critical-ui-run46' -Purpose 'CRITICAL-REAL-JOE-UI-001 fresh prompt'
#
# Guarantees:
# - The directory must NOT exist: creation uses New-Item, which fails when the
#   path is taken. There is no check-then-create race and no silent reuse of a
#   prior run's directory (the run43/run45 collision class).
# - A MANIFEST.txt is written inside with creator, timestamp and purpose, so a
#   later audit can prove which run owns the directory.
# - Any failure aborts with a non-zero exit before the caller writes evidence.
param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Purpose
)

$ErrorActionPreference = 'Stop'

if ($Name -match '[\\/:\*\?"<>\|]') { throw "Refusing unsafe evidence dir name: $Name" }

$root = 'D:\Joe\muse-worktree\tmp'
$target = Join-Path $root $Name

try {
    $dir = New-Item -ItemType Directory -Path $target -ErrorAction Stop
} catch {
    throw "Evidence dir already exists, refusing to reuse: $target"
}

$manifest = @(
    "EVIDENCE_DIR=$Name",
    "CREATED_UTC=$([DateTime]::UtcNow.ToString('o'))",
    "CREATED_BY=MUSE",
    "PURPOSE=$Purpose",
    "GUARD=New-Item CreateNew, reuse refused"
) -join "`r`n"
[IO.File]::WriteAllText((Join-Path $dir.FullName 'MANIFEST.txt'), $manifest + "`r`n")
Write-Output $dir.FullName
