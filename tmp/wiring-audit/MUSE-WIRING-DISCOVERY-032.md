# MUSE Wiring Discovery 032 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 32)
HEAD=0702bf61 + this checkpoint (survey/docs only, no source edits)
DATE=2026-09-30
METHOD=read-only repair-readiness re-verification of all P2 backlog
batches (ready32.ps1): per-batch defect-pattern presence re-check at Muse
HEAD + main-parity (inherited vs Muse-made) + NVIDIA-dirty overlap scan +
open-consultation/dependency gating. Filed runs A/B SHA256-identical
(FC352230...06CAA202), 52 rows, exit 0 each. Two pilot runs preceded the
filed pair and are honestly discarded: pilot-1 had 3 weak anchors
(P2-006 first-match hit the util definition :11 not the default-root
call site; P2-024 first-match hit an unrelated rank ternary :448;
P2-036 regex `\s` could not match the literal `\s` source text);
all three were corrected after direct source reads (P2-006 workDir
call site :50, P2-024 `r.success ? 0 : 1` :1084, P2-036 literal
`###\s+Function` :823) and pilot-2 confirmed the corrected lines
before the filed A/B. No live process survived; no source edits;
architecture + package-scripts guards re-verified green.
EVIDENCE=tmp/wiring-audit/fx-ready32/ready32.ps1 + ready32_run{A,B}.json
+ ready32_run{A,B}.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=checkpoint 31 (P0/P1 readiness, filed in 0702bf61).

## Scope (repair-readiness, not new discovery)

All 52 P2 batches: WIRING-P2-001..052. For each: defect still present
at HEAD? same on main? overlapping NVIDIA dirty files or NVIDIA-owned
scope? gated by an open consultation or dependency? Verdict:
READY_FOR_OWNER / SPLIT / READY_FOR_PROPOSAL / COORDINATION_BLOCKED.

## Parity result (52 rows, A/B identical)

- 51 rows BOTH_PRESENT: 47 at IDENTICAL line numbers (muse@N == main@N),
  4 with line drift but identical anchor text:
  P2-018 scopeRoot 1570/1568 (Muse +2, verification edits nearby),
  P2-019 evidenceLocation reader 1330/1328 (Muse +2, same),
  P2-020 sideEffects 58/57 (Muse +1),
  P2-023 zip -r 251/225 (Muse +26, 990cf029 port-guard slice).
  Anchor CONTENT identical in all four; drift is additive Muse
  context, not a defect change.
- 1 row BOTH_ABSENT by design: P2-047 (evidenceLocation absent from
  QualityTools.ts in both trees) — the absence IS the defect
  (checkers emit no evidence pointer), confirmed both trees.
- 0 MUSE_ONLY, 0 MAIN_ONLY: all 52 defects inherited, none
  introduced and none fixed on either side since filing.
- Scheme honesty spot: P2-028 matched text confirms plaintext
  `http://ip-api.com/json/...` in both trees.

## Overlap result (NVIDIA main, read-only, this cycle)

NVIDIA tracked-dirty is the same 12 files as checkpoint 31
(app-blueprints, IntentParser, context-engine, long-term-memory,
PlanningEngine, plan-tools, ProjectPipelineTool, registry.ts,
tool-aliases.test, package.json/lock, capability-registry doc).
Direct file overlap with P2 FILES: NONE — no P2 batch touches a
dirty file. Shared-surface batches (ToolService, router, ledger,
PhaseExecutor) still need owner decisions regardless.

## Readiness verdicts

### COORDINATION_BLOCKED (do not start; decision first)

- P2-001 memory dual implementation: inline handler ToolService.ts:571
  both trees; ToolService shared + memory overlaps NVIDIA-claimed files.
- P2-007 risk-scan shadows: classifyToolRisk ToolService.ts:142 both
  trees; shared classifier.
- P2-008 session-injection verdict: guard BrowserRunTool.ts:248 both
  trees; ToolService injection block shared.
- P2-015 model-fallback contract: match-or-'{}' EliteTools.ts:66 both
  trees; router + ToolService shared + NVIDIA provider-adjacent
  verification needed before assignment.

### SPLIT (independent half ready now, rest rides a decision)

- P2-036 doc counts: counts fix READY now; extensionless-outside-write
  half rides the P2-037 ONE-rule decision.
- P2-041 python execution: description + session-temp staging READY
  now; workingDirectory containment rides P2-037.
- P2-045 video action: required/validation + savedPath verification
  READY now; path containment + argv-hardening ride P2-037/P1-012.

### READY_FOR_PROPOSAL (evidence complete; design/decision first)

- P2-002 single-winner gate (needs gate design + image_generate
  creative decision), P2-005 cause-wrapper scope (wrapper-vs-tool-site
  + engine exitCode root), P2-018 scopeRoot resolution (PhaseExecutor
  shared + NVIDIA-adjacent), P2-019 + P2-047 evidence-meaning/pointer
  decision (ride P2-018), P2-025 found-shape + verdict mapping (+#14
  sibling), P2-031 store scoping design (cross-session probing needs
  ownership decision), P2-037 ONE containment rule (needs owner-binding
  input), P2-042 verdict vocabulary (+#13 class), P2-048 reuse DECISION,
  P2-049 CortexState retire-vs-wire, P2-050 AlertService wire-vs-remove,
  P2-051 queue-route disposition (+ out-of-repo caller sweep), P2-052
  TaskTracker retire-vs-render.

### READY_FOR_OWNER (tool-local, inherited, no open gate)

P2-003 declaration batch, P2-004 lifecycle schema, P2-006 default
roots + dead input, P2-009 zip backend, P2-010 audit error text,
P2-011 browser sideEffects (+P2-020 same gate), P2-012 run output,
P2-013 URL vocabulary, P2-014 compare fidelity, P2-016 viewport flag,
P2-017 baseline scoping, P2-020 tester sideEffects, P2-021 scanner
file-target, P2-022 dev-server guard, P2-023 zip quoting, P2-024 exit
fidelity (P1-010 dep is live-proof-only, not a fix blocker), P2-026
optimizer description + guard, P2-027 seeder rows contract, P2-028
transport scheme + bounds, P2-029 analyzer receipt + guard, P2-030
monitor tracked honesty, P2-032 todo receipt + guard, P2-033 profile
slot scope (synthetic fixtures only), P2-034 form isAr one-liner
(smallest batch, good first-commit candidate), P2-035 infra error
channel, P2-038 CI input contract, P2-039 go/java canned shape
(P1-010 dep only if effect implemented), P2-040 python builder
contract (P2-037 only if materialize chosen), P2-043 swagger
correctness (P1-015 paths first or with), P2-044 credential-tool
validation (fixture-level, never live sends), P2-046 image receipt
honesty (coordinate P1-010 prefix rule).

## Ranking (impact x readiness, Muse's recommendation)

1. Decision batches first (P2-037 ONE rule unlocks P1-014/015/036/040/
   041/045; P2-042+P2-025 verdict class; P2-018/019/047 receipt class).
2. Tool-local honesty sweep in file batches (QualityTools: P2-010/038;
   builders: P2-023/039/040/041; observability: P2-029/030/032).
3. Quick wins: P2-034 (one line), P2-016 (one line), P2-027 (one
   clamp), P2-036-counts (two regexes).
4. Blocked set waits on: owner decisions (P2-001/007/008/015) and the
   P2-037 + verdict-mapping proposals.

## Counts (this checkpoint)

BATCHES_REVIEWED=52 (all P2)
READY_FOR_OWNER=31
SPLIT=3 (independent half ready)
READY_FOR_PROPOSAL=14
COORDINATION_BLOCKED=4
DEFECTS_STILL_PRESENT=52/52 at Muse HEAD
INHERITED=52/52 (51 BOTH_PRESENT incl 4 drifted-content-identical;
P2-047 BOTH_ABSENT by design)
NEW_MISMATCHES=0 (re-verification only; F-series untouched)

## Staging updates (this checkpoint)

- JOE-WIRING-REPAIR-BACKLOG.md: +READINESS/+READINESS_EVIDENCE per P2.
- JOE-WIRING-AUDIT-SUMMARY.md: checkpoint-32 readiness line, NEXT step.
- No matrix/register/architecture change (no new wiring disposition).
