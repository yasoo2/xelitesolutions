# Wiring audit checkpoint 058 — live name-set reconciliation EXACT (2026-10-01, Muse)

MUSE_HEAD=3b70b255. MAIN=e8fd9589 (+14 dirty, read-only, untouched). Mode:
read-only discovery; no production source changed anywhere.
Probe: tmp/wiring-audit/nameset058.cjs -> nameset058.json (this cycle).

## Method
- Live: GET /api/tools on :5101 (own Muse-bundle UAT runtime, PID 24464,
  "Registered 163 tools (71 revived)") and :5000 (main). Read-only; the
  :5101 GET ran while run35 UAT was in flight and touches no run state.
- Static anchor: literal occurrence of each live tool name anywhere in
  api/src (**/*.ts excluding *.test.ts, node_modules/dist/cache skipped),
  indexed separately in BOTH trees.

## Proven this cycle
P1. LIVE_5101_COUNT=163, LIVE_5000_COUNT=164; count field == entries length
    on both; DUPLICATES=0 on both (startup dedupe/throw corroborated live).
P2. SET_DIFF exact: only_5101 = {} (empty); only_5000 =
    {"specification_verification"}. So live-5101 SUBSET live-5000 exactly;
    the single-name delta is the known NVIDIA dirty-tree registration
    (SpecificationVerificationTool), not an unexplained gap.
P3. SOURCE ANCHOR: all 164 union names occur literally in api/src of at
    least one tree; names_without_any_src_anchor = {} (empty). No live
    name is a phantom with zero source presence.
P4. safeNew( literal counts re-confirmed: muse=71, main=71 (registry.ts).

## Finding
F-058-1 LIVE_NAME_SETS_RECONCILED: the two live registries differ by
exactly one known dirty-tree name; every live name has a source anchor.
This is NAME-LEVEL reconciliation, not wiring proof: it does not show
PLANNER_VISIBLE, EXECUTABLE, or contract validity for any name. Those
sets remain UNKNOWN (next steps, unchanged).

## Counts (proven vs unknown — no invention)
REGISTERED_LIVE_MUSE=163 REGISTERED_LIVE_MAIN=164 DUPLICATES_LIVE=0
NAME_DELTA_MUSE_MINUS_MAIN=0 NAME_DELTA_MAIN_MINUS_MUSE=1 (specification_verification)
DISCOVERED_TOOLS=UNKNOWN EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN
PARTIALLY_WIRED=UNKNOWN ORPHANED=UNKNOWN (registry-level corroborations stand:
bulk_file_generator + generate_image IMPORTED_NOT_REGISTERED) DUPLICATE=UNKNOWN
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0.

## Next discovery step
PLANNER_VISIBLE set: extend the 65-goal sweep with per-goal offered-sets on
the CURRENT Muse HEAD (prior sweep ran at an older HEAD) and diff offered
vs registered. Owner: Muse lane. No repair proposed (discovery only).
