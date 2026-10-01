# Wiring audit checkpoint 057 — the +11 live-vs-source expansion SOLVED (2026-10-01, Muse)

MUSE_HEAD=78ed6076. MAIN=e8fd9589 (+14 dirty, read-only, untouched). Mode:
read-only discovery; no production source changed anywhere. Live runtimes
probed read-only (GET /api/health + /api/tools only); nothing restarted.

## Question (deferred from 055)
Live 164/163 vs mechanical source count 153/152 (+11 both sides). Mechanism was
UNPROVEN. This checkpoint closes it.

## Method
Read the actual listing path instead of re-grepping:
- `GET /api/tools` (api/src/api/routes/tools.ts:16-19) returns the `tools`
  array from registry.ts verbatim: `{ count: tools.length, tools }`.
- `tools` (registry.ts:399-422) = baseTools + ...revivedTools, Boolean-filtered,
  name-deduped (startup THROWS on duplicates, so live length = unique entries).
- Enumerated EVERY entry in the baseTools literal (lines 227-340) by syntactic
  class, plus the revivedTools literal (lines 138-225), in BOTH trees.

## Proven this cycle
P1. MUSE static entry census (exact, line-verified):
    plain `new X(` ............ 55
    namespaced `new EliteTools.X(` . 8  (L277-284; missed by 055 grep: no dot)
    `createTool(` calls ........ 26  (27th match is the def at :110)
    bare `ArchitectTool,` ...... 1   (L271; missed: no `new`)
    `...MemoryTools` spread .... 2   (recall_memory, memorize_codebase; missed:
                                        names live in MemoryTool.ts)
    BASE SUBTOTAL .............. 92
    `safeNew(` revived ......... 71  (all instantiate; live log confirms)
    PREDICTED TOTAL ............ 163
P2. MUSE live ground truth: run34 :5101 startup log "Registered 163 tools
    (71 revived)" (Muse bundle, this branch line). 163 == 163 EXACT.
P3. 055's mechanical 152 reconstructed: its `createTool|new \w+Tool` line-grep
    counted 26 createTool + (55 plain new + 71 safeNew-embedded new) = 152,
    missing EXACTLY the 8+1+2 = 11. The +11 is a grep artifact with a fully
    identified mechanism, not alias/revival expansion. ("71 revived" was never
    the +11; it was counted all along.)
P4. MAIN static census (read-only): safeNew=71, EliteTools=8, MemoryTools
    spread=1x2 entries (same 2 names), bare Architect=1, createTool calls=27
    (26 + SpecificationVerificationTool :295). PREDICTED TOTAL = 164.
P5. MAIN live ground truth: :5000/api/tools = 164 entries (055 payload;
    re-confirmed reachable this cycle via /api/health OK). 164 == 164 EXACT.
P6. FRESH live re-probe this cycle: :5002/api/health OK (uptime ~14.9h, same
    stale bundle), /api/tools = 163 entries, has_specification_verification
    = False. F-055-1 (stale candidate, drift not defect) STANDS unchanged.

## Finding (closes 055 open item)
F-057-1 LIVE_SOURCE_COUNT_RECONCILED (both trees, exact): every live /api/tools
entry is predicted by static registry enumeration; zero unexplained entries in
either direction at COUNT level. Assumptions (stated, not hidden): all 71
safeNew instantiate non-null (live "71 revived" log corroborates); no duplicate
names (startup would throw; both runtimes run). NAME-SET reconciliation
(predicted name list vs live name list) is NOT done — class-held `name` fields
need per-file extraction; that is the next step, not claimed here.

## Counts (proven vs unknown — no invention)
REGISTRY_STATIC_MUSE=163 (92 base + 71 revived) — PREDICTED, matches live run34.
REGISTRY_STATIC_MAIN=164 (93 base + 71 revived) — PREDICTED, matches live :5000.
REGISTERED_LIVE_5002=163 (re-probed; stale bundle, no spec_ver).
DISCOVERED_TOOLS=UNKNOWN EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN
PARTIALLY_WIRED=UNKNOWN ORPHANED=UNKNOWN (registry-level corroborations stand:
bulk_file_generator + generate_image IMPORTED_NOT_REGISTERED) DUPLICATE=UNKNOWN
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0.

## Next discovery step
Name-set reconciliation: extract declared `name` per registry entry (class
fields + MemoryTools + TodoWriteTool label) and diff against live /api/tools
name sets from 055 payloads. Then PLANNER_VISIBLE set (still open since 054).
Owner: Muse lane. No repair proposed (discovery only; +11 was never a defect).
