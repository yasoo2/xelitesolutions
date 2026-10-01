# Muse deep-wiring audit checkpoint 4 — 2026-10-01 (MUSE_HEAD=439efe14)

Command: CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT.
Scope: cross-review of shared SUMMARY/REGISTER (Sept 29) against BOTH current
trees + fresh executed boot evidence. No source changed. Main inspected
read-only (e8fd9589 + 14 dirty files preserved, untouched).

## Fresh executed evidence (today, Muse tree @ 439efe14)

- Boot log tmp/uat-critical-ui-run6/api-5101.log: `Registered 163 tools
  (71 revived)` from CURRENT dist (resolvePort present = includes 990cf029,
  latest source commit). LEVEL-2 evidence, executed, not inferred.
- Committed-main registry has NO SpecificationVerificationTool: main working
  tree diff shows it as +2 DIRTY lines (import + createTool). Committed main
  (e8fd9589) = 163, identical count to Muse. The summary's "main 164" was
  measured on a dirty tree; counts must be revision-specific (committed 163
  / dirty-main 164). Same precision Codex applied to the 163/164 typo.
- bulk_file_generator: still exactly 1 registry.ts reference (line 18
  import), zero createTool. IMPORTED_NOT_REGISTERED zero-drift reconfirmed.
  Do NOT register (uncontained absolute-path writes). Audit only.

## Cross-review corrections (evidence-backed, for Codex reconciliation)

C1. LEVEL-6 MISLABEL (summary lines 71-72). test:joe:engineer-flow and
test:self-healing PASS are claimed as LEVEL 6 (Real Joe UI). Both use a
deterministic mocked planner (AGENTS.md: "proves infrastructure path, not
real-world planning"). Highest honest level = LEVEL 5 (canonical pipeline).
Internal PASS must never be labeled REAL_JOE_UI PASS.

C2. O004/O006/O007 STALE — NOW WIRED. shop-qa, live-data-qa, image-semantic-qa
are TRACKED (git ls-files), IMPORTED (app-audit.ts:30-32) and CALLED
(app-audit.ts:1684/1702/1716) since Muse 94394552 (postdates the register).
Remove all three from ORPHANED.

C3. O002/O003/D001 WRONG SHAPE. Both trees contain ONE const export
(ImageGenerationTool, name 'generate_image'; Muse ImageGenerationTool.ts:4-5,
main identical), imported (registry:15) but never registered. There are no
"two classes" and no duplicate to consolidate. Rewrite as a single
IMPLEMENTED_NOT_REGISTERED + broken alias (ToolService.ts:551-552
image_generate -> unregistered generate_image). DUPLICATE 1 -> 0.
Note: the module top-imports 'openai'; registration needs repair, not a
one-line createTool. Same "do not simply register" rule as bulk.

C4. O001 is deliberate design (KEEP_AS_ALIAS, semantic guard in
wiring-policy.test.ts), not an orphan. Reclassify to ALIAS_BY_DESIGN.

C5. REGISTER OMITS bulk_file_generator. Needs O008 entry
(IMPORTED_NOT_REGISTERED, registry.ts:18, catalogued, PhaseExecutor-
allowlisted, uncontained writes — Codex Sept-30 finding, still true).

C6. COUNT HYGIENE. (a) CONTRACT_MISMATCH "80+" conflates 51 empty-permissions
+ 29 zero-rateLimit BOOT-NORMALIZED defaults (registry enforceContract, by
design) with ~6 true boundary mismatches (the boundary table). Split
DESIGNED_DEFAULT vs TRUE_MISMATCH. (b) "71 revived not in planner catalogue"
vs "REGISTERED_NOT_PLANNER_VISIBLE ~20" is internally inconsistent (71 vs
20) — clarify revived-vs-visible. (c) LEGACY_OR_DEAD 0 while L001 is called
"confirmed legacy" — label tension; pick one.

## Proposed corrected counts (Muse position, needs Codex accept)

ORPHANED 7 -> 2 confirmed (bulk_file_generator, generate_image);
DUPLICATE 1 -> 0; O004/O006/O007 -> WIRED; O001 -> ALIAS_BY_DESIGN;
REGISTERED committed 163 both trees (dirty-main 164); EXECUTABLE,
FULLY_WIRED, PARTIALLY_WIRED stay UNKNOWN (firewall/executor tracing
still pending — claimed 163/9/9 in summary are NOT independently
re-verified by Muse and must not be cited as cross-reviewed).

## Still UNKNOWN (explicit)

Per-tool EXECUTABLE (firewall allow/deny per tool), FULLY/PARTIALLY_WIRED
splits, dormant-priority 16 (OBSOLETE_REGISTRATION), EXECUTABLE_NOT_VERIFIABLE
per-tool survey, TEST_ONLY separation. Next checkpoints.

## Concurrent work

Real-Joe-UI run6 (csv2json, fresh prompt) in progress on :5101 this cycle;
SEND 07:32:39Z confirmed. Its outcome is recorded separately, not here.
