# MUSE Wiring Discovery 031 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 31)
HEAD=796bc066 + this checkpoint (survey/docs only, no source edits)
DATE=2026-09-30
METHOD=read-only repair-readiness re-verification of all P0/P1 backlog
batches (ready31.ps1): per-batch defect-pattern presence re-check at Muse
HEAD + main-parity (inherited vs Muse-made) + NVIDIA-dirty overlap scan +
open-consultation/dependency gating. Filed runs A/B SHA256-identical
(6D50F6CE...D130B7), 34 rows, exit 0 each. One script revision preceded the
filed pair and is honestly discarded: pilot paths for ExecutionEngine
(core/execution -> kernel), verification-ledger (core/verification ->
core/quality), network-policy (core/network -> core/api-discovery),
isWithinRoot (utils.ts -> path-containment.ts) and class-vs-object shapes
for BulkFileGeneratorTool/ApiProjectTool were corrected after direct source
reads; pilot JSON superseded, never filed. No live process survived; no
source edits; architecture + package-scripts guards re-verified green.
EVIDENCE=tmp/wiring-audit/fx-ready31/ready31.ps1 + ready31_run{A,B}.json
+ ready31_run{A,B}.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=checkpoint 30 (workers surveyed, filed in 796bc066).

## Scope (repair-readiness, not new discovery)

All 17 P0/P1 batches: P0-001 + P1-001..P1-016 (P1-003 read at staging
line 569). For each: defect still present at HEAD? same on main?
overlapping NVIDIA dirty files or NVIDIA-owned scope? gated by an open
consultation or dependency? Verdict: READY_FOR_OWNER / READY_FOR_PROPOSAL
/ PARTIAL / COORDINATION_BLOCKED / SPLIT.

## Parity result (34 rows, A/B identical)

- 25 rows BOTH_PRESENT at IDENTICAL line numbers (muse@N == main@N):
  every re-checked defect is inherited, not Muse-made.
- P1-001b2 (registry lowercase 'bulk_file_generator') BOTH_ABSENT +
  P1-001b (import) BOTH_PRESENT: imported-but-unconstructed CONFIRMED
  both trees.
- P1-015b (resolveToolPath in SwaggerDocsTool) BOTH_ABSENT: the defect
  (no containment call) CONFIRMED both trees.
- P1-002a/b/c/d MUSE_ONLY: 4 untracked drafts exist in Muse, absent main.
- P1-009a (resolvePort) MUSE_ONLY: Muse's implemented port-guard slice
  present, absent main. Commit 990cf029 verified ancestor of HEAD.
- P1-009b (`which lt`) BOTH_PRESENT: remainder still open both trees.
- Honesty note: P1-005b first-match is the `shell: true` comment at
  ExecutionEngine.ts:629; the live site is :641 (verified by direct read
  during triage). Defect stands.

## Overlap result (NVIDIA main, read-only, this cycle)

NVIDIA tracked-dirty is the same 12 files (app-blueprints, IntentParser,
context-engine, long-term-memory, PlanningEngine, plan-tools,
ProjectPipelineTool, registry.ts, tool-aliases.test, package.json/lock,
capability-registry doc). Direct file overlap with P0/P1 FILES: ONLY
registry.ts (P1-001). ToolService.ts, ExecutionEngine.ts,
WorkspaceService.ts, path-containment.ts are NOT dirty — no edit
collision today, but shared-surface batches still need owner decisions.

## Readiness verdicts

### COORDINATION-BLOCKED (do not start; decision first)

- P0-001 direct-HTTP policy: Codex isolated candidate
  6965d584/96d01386/35bf42dd exists; exact Muse/NVIDIA reviews pending.
  Second implementation forbidden.
- P1-001 orphans: registry.ts is NVIDIA-dirty (CLI batch); wire-vs-retire
  needs P2-002 gate + owner; bulk_file_generator containment first.
- P1-005 shell-escape: REPO-COMMAND-SHELL-BOUNDARY-001 open (Muse
  APPROVE_WITH_CHANGES, NVIDIA REWORK_BEFORE_INTEGRATION); synchronized
  owner decision required after CLI checkpoint. Shared engine/firewall.
- P1-010 extended-prefix cwd: WINDOWS-SHELL-CWD-P1-010 open, real reviews
  pending, owner unassigned. Shared WorkspaceService/utils/SystemTools.

### SPLIT

- P1-002 drafts: 3 QA drafts (Muse-authored, no overlap) READY_FOR_OWNER
  as integrate-or-classify; nvidia.ts provider draft BLOCKED (overlaps
  Codex experiments + NVIDIA interests; ownership decision required).

### PARTIAL

- P1-009 deploy interpolation: port-guard slice IMPLEMENTED (990cf029,
  ancestor of HEAD, Codex ACCEPT_NARROW_CONTRACT). Independent review of
  the slice still pending. Remainder open: `which lt` POSIX-only, silent
  global install, systemic ToolService inputSchema enforcement, P2-023
  zip-path sibling.

### READY_FOR_PROPOSAL (evidence complete, consultation needed)

- P1-012 engine exit-blindness: central ExecutionEngine.run mapping +
  5/5 consumer survey live 2x (027). Recommended FIRST repair proposal:
  false-success blast radius (docker, video, error_recovery) + inverted
  twins (runcmd/diff) + honest control all pinned. P1-010 dependency is
  stderr-cleanliness only, not a fix blocker.

### READY_FOR_OWNER (tool-local, inherited, no open gate)

- P1-003 deploy_pages token scope (fixture-only design; never live).
- P1-004 page_fix session bypass (needs P2-013 contained-URL vocabulary
  first or with; two-session negative test).
- P1-006 github_actions traversal/substitution (clean negatives).
- P1-007 4-root writer containment (multi-file; reviewer must cover the
  shared resolveToolPath rule review).
- P1-008 project_stop kill verification (+deploy pidfile disposition).
- P1-011 analyzer uncontained read (sibling profile pattern to reuse).
- P1-013 i18n dead require (one-line + tests; smallest batch, good
  first-commit candidate).
- P1-014 go/java scaffold anchoring (must follow P2-037 reconciled rule).
- P1-015 swagger path anchoring (same P2-037 note).
- P1-016 fetch SSRF policy (in-repo precedents; loopback legs only AFTER
  policy lands, never before).

## Ranking (impact x readiness, Muse's recommendation)

1. P1-012 proposal first (engine truth; unblocks honest verdicts).
2. Tool-local containments: P1-006, P1-007, P1-011, P1-014, P1-015, P1-016.
3. Quick win: P1-013 (tiny, proves the repair pipeline).
4. Then P1-004, P1-008, P1-003, P1-002-QA-split.
5. Blocked set waits on: CLI batch landing (P1-001), consultation
   decisions (P1-005, P1-010, P0-001), provider ownership (P1-002-nvidia).

## Counts (this checkpoint)

BATCHES_REVIEWED=17 (1 P0 + 16 P1)
READY_FOR_OWNER=10 (incl. P1-002-QA-split)
READY_FOR_PROPOSAL=1 (P1-012)
PARTIAL=1 (P1-009)
COORDINATION_BLOCKED=5 (P0-001, P1-001, P1-002-nvidia, P1-005, P1-010)
DEFECTS_STILL_PRESENT=17/17 at Muse HEAD
INHERITED=16/16 comparable (all BOTH_PRESENT identical lines; P1-002
Muse-only by construction; P1-009a Muse's own fix)
NEW_MISMATCHES=0 (re-verification only; F-series untouched)

## Staging updates (this checkpoint)

- JOE-WIRING-REPAIR-BACKLOG.md: +READINESS/+READINESS_EVIDENCE per P0/P1.
- JOE-WIRING-AUDIT-SUMMARY.md: checkpoint-31 readiness line, NEXT step.
- No matrix/register/architecture change (no new wiring disposition).
