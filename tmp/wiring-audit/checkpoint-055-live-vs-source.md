# Wiring audit checkpoint 055 — live-vs-source tool reconciliation (2026-10-01, Muse)

MUSE_HEAD=d38ed615. Mode: read-only discovery; no production source changed.
Shared runtimes probed read-only (GET /api/health + /api/tools only); nothing
restarted, nothing written outside Muse workspace.

## Proven this cycle

P1. LIVE REGISTERED counts (fresh GET, this cycle):
    :5000/api/tools = 164 entries (main-line runtime, uptime ~21.6h)
    :5002/api/tools = 163 entries (candidate backend, uptime ~14.2h)
    :5101 startup  = 163 tools "71 revived" (Muse bundle, run34, this cycle)
    Raw payloads: fx-census06/tools-5000.json (122045B), tools-5002.json (120661B).
P2. Live set diff (:5000 minus :5002) = EXACTLY ONE name:
    5000-only: ["specification_verification"]; 5002-only: [].
P3. Source ground truth (read-only, both trees):
    - main registry.ts:295 `createTool(SpecificationVerificationTool)` present
      (import :37); name='specification_verification' (Definition :24).
      => :5000 serving it is CORRECT (matches main source).
    - Muse tree: file absent, registry absent => Muse 163 bundle is CORRECT
      for its source (no silent drop).
    - shell-cwd candidate tree: file absent => :5002 lacking it is branch
      drift (candidate predates the tool), not a runtime defect.
P4. Registry source entries (createTool|new *Tool count, mechanical):
    main=153, muse=152, delta=1 (SpecificationVerificationTool). Consistent
    with P2/P3: exactly one registered tool differs between the trees.
P5. Live-vs-source gap: live 164/163 vs source 153/152 (+11 both sides).
    Mechanism UNPROVEN this cycle (suspect alias/revived expansion in the
    /api/tools listing; startup log says "71 revived" which does NOT equal
    11, so the expansion rule is not yet understood). NOT claimed.

## Finding (new, evidence-backed)

F-055-1 CANONICAL_USER_ENTRY_MISSING_REGISTERED_TOOL (severity: medium,
drift not defect): the user-entry runtime :5002 does not serve
specification_verification although it is REGISTERED in main source. Cause
is stale candidate base, not miswiring. Consequence: planner behavior and
verification capability observed on :5002 are not representative of main
for this tool. Remedy: rebase/refresh candidate before :5002-based UAT is
used as acceptance for verification-domain work. Owner for the refresh
decision: CODEX (candidate owner). No Muse implementation started.

## Counts (proven vs unknown — no invention)

REGISTERED_LIVE_5000=164 REGISTERED_LIVE_5002=163 REGISTERED_LIVE_5101_MUSE=163
REGISTRY_SOURCE_MAIN=153 REGISTRY_SOURCE_MUSE=152
DISCOVERED_TOOLS=UNKNOWN EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN
PARTIALLY_WIRED=UNKNOWN ORPHANED=UNKNOWN (1 corroborated:
bulk_file_generator IMPORTED_NOT_REGISTERED, checkpoint 054 re-affirmed by
no-drift: Muse registry.ts still import-only) DUPLICATE=UNKNOWN
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0.

## Correction to checkpoint-054 method note

054's registry check for bulk_file_generator used a name grep; 055 confirms
the robust pattern is CLASS-name grep (SpecificationVerification hits at
registry.ts:37/:295 while snake_case hits 0). The bulk_file_generator
IMPORTED_NOT_REGISTERED verdict is unaffected (its check was full-file
'bulk' grep = import only), but future registry reconciliation must grep
BOTH spellings. census06.cjs already uses symbol-based matching (correct).

## Next discovery step

Explain the +11 live-vs-source expansion: read the /api/tools listing
implementation + revival/alias logic and predict 164/163 from 153/152
exactly. Then PLANNER_VISIBLE set (which of the live names the planner can
actually select) — the deferred 054 item, still open.
