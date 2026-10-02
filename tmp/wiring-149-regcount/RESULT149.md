# WIRING-149 — Registry-count reconciliation (Muse independent cross-check)

MUSE_HEAD=55ade54a3a367c313742b9c4133054747e77d1b7 (tracked CLEAN at probe time; all 149 outputs new under tmp/wiring-149-regcount/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T16:5xZ (this cycle)
PROBE=tmp/wiring-149-regcount/probe-regcount149.mts (live import of registry + catalogue + TOOL_ALIASES in the named tree; ZERO dispatch; synthetic test-only JWT + JOE_TEST_MODE; timings to stderr)
RUNS=muse1,muse2 (ROOTDIR=muse-worktree/api) + nvidia1,nvidia2 (ROOTDIR=xelitesolutions/api), sequential, same probe bytes.

## TRIGGER
NVIDIA published D:\Joe\coordination\team\JOE-WIRING-AUDIT-SUMMARY.md (10/2 19:27 local, cycle-66/67) with headline counts REGISTERED_TOOLS=164 / RAW_TOOL_DEFINITIONS=94 sourced to "main branch e8fd9589", plus UNKNOWN=0 and Level-6 Real-UI ✅ x8. Muse wiring-142 measured 163/163 live in the Muse tree. This probe reconciles the two numbers with byte-identical pairs in BOTH trees.

## LIVE RESULTS (parsed JSON; pairs byte-identical — hashes below)

| metric | MUSE tree | NVIDIA tree |
|---|---|---|
| registry log | `Registered 163 tools (71 revived).` | `Registered 164 tools (71 revived).` |
| registeredCount | 163 | 164 |
| duplicateNames | 0 | 0 |
| missingExecute (no execute fn) | 0 | 0 |
| contractDefaultedPermissions | 21 | 21 |
| contractDefaultedRateLimit | 2 | 2 |
| contractUnknownPermissions | 0 | 0 |
| catalogueCount | 40 | 40 |
| catalogueSha256 | a7d9af18…f152 | a7d9af18…f152 IDENTICAL |
| aliasCount | 28 | 28 |
| aliasSha256 | IDENTICAL | IDENTICAL |
| defFileCount | 93 | 94 |
| declaredNameCount (regex) | 181 | 182 |
| registeredSha256 | 2d45e6fa…1f54 | DIFFERS (expected: +1 tool) |

Pair stdout hashes (bytes as stored, UTF-16 PS redirect + 1 trailing provider notice line — see disclosures):
muse1=muse2=95DFDF4CB8FB70D3662E5B996A4BE97D4FDC0765D4F88693ECDE018BE86230DA
nvidia1=nvidia2=AC1FD7BBAE4B1B91E451DF5CBDEBC29D4255E35FABFD9CB00115C3F818E57023

## RECONCILIATION: 163 vs 164 — BOTH TRUE, DIFFERENT TREES
- NVIDIA `git diff` on registry.ts = EXACTLY +2 lines (import + createTool for SpecificationVerificationTool; tool name `specification_verification`). File SpecificationVerificationTool.ts is UNTRACKED (NVIDIA EVAL-006 scope, active work, untouched).
- Def-file diff: the ONLY NVIDIA-side file is SpecificationVerificationTool.ts → 94 = 93 + 1 untracked.
- Therefore: committed main e8fd9589 = 163 registered / 93 def files (same as Muse tree for these files); 164/94 exists ONLY in NVIDIA's dirty worktree.
- safeNew( count = 71 in BOTH trees; both live logs say "(71 revived)" → all revive; no silent null.
- Catalogue untouched by NVIDIA dirty edits (101+/13- plan-tools diff contains ZERO +/- `tool:` lines) and live sets byte-identical → REGISTERED_NOT_PLANNER_VISIBLE = 124 (dirty) / 123 (committed).

## VERDICTS ON SUMMARY CLAIMS (Muse independent position)
1. RAW_TOOL_DEFINITIONS=94 / REGISTERED_TOOLS=164 — CONFIRMED for the NVIDIA dirty worktree; PROVENANCE CORRECTION REQUIRED: summary says "Source: main branch e8fd9589" but committed main measures 163/93. Every count must pin tree+dirty state. (OBS-149-1 P2)
2. EXECUTABLE_TOOLS "all have execute()" — CONFIRMED live in both trees (0 missing).
3. DUPLICATE=0 / registry uniqueness — CONFIRMED live in both trees (0 dupes).
4. Catalogue 40, aliases 28, revived 71 — CONFIRMED live in both trees, catalogue+alias sets identical.
5. 21 defaulted permissions + 2 defaulted rate limits — CONFIRMED live in both trees; independently corroborates NVIDIA's cycle-22 observation across all three lines.
6. IMPLEMENTED_NOT_REGISTERED=0 — CHALLENGED. Name-level scan finds an IDENTICAL 18-name declared-not-registered list in both trees: app,author,bulk_file_generator,codebase_navigator,description,desktop,entities,express,fullstack,generate_image,mobile,next,tablet,title,torvalds,viewport,visibility,visual_qa. Most are regex noise (object-literal `name:` keys), BUT bulk_file_generator/codebase_navigator/visual_qa corroborate wiring-144 TRUE-dangling and generate_image corroborates OBS-148-1 ghost. File-level "every def file registers ≥1 tool" may hold; name-level "0" does not. Needs a name-level definition, not deletion. (OBS-149-2 P3)
7. UNKNOWN=0 / "All classified" — CHALLENGED as premature given (6) + open OBS-144-1/148-1/148-2/149 items.
8. Level-6 Real-UI ✅ x8 — CHALLENGED. Contradicts TEAM-STATE (no product PASS; RealJoe proven 0) and CRITICAL-REAL-JOE-UI-001 PENDING; no run evidence cited. Downgrade to REPORTED_BY_NVIDIA/UNVERIFIED until cited runs are produced. (OBS-149-3 P2)
9. "No code defects in canonical path" / UI-001 "fixed and regression-tested" — PARTIAL. The 1cf1102f smoke-rewrite fix is real and the contract death is gone (run3 evidence), but the command requires a fresh-prompt full PASS; PARTIAL stands.

## DISCLOSURES / LIMITS
- Probe stdout files are UTF-16 (PowerShell `1>` redirect) with ONE trailing `[providers] بلا مفتاح…` line printed async AFTER the JSON by an imported provider module; JSON parsed after stripping that line. Pairs byte-identical including the stray line. Not a product defect for this audit.
- registeredNotDeclared=[ls] in both trees is a PROBE artifact: the declared-name regex requires ≥3 chars, `ls` has 2. No finding.
- declaredNotRegistered list is regex-corroborating only (same caveat as wiring-148); only the 4 corroborated names above are carried as findings.
- NVIDIA tree touched READ-ONLY (live imports; every output written to Muse workspace; tsx/node caches redirected to this dir's cache/). NVIDIA cycle-67 stayed active throughout; nothing stopped, nothing written there.
- No source changed this cycle (docs/evidence only); api/ delta = 0 lines.

## CONTRACT JEST RE-RUN (same cycle)
- smoke-verification-rewrite.test.ts: 5/5 PASS, 19.7s (jest-smoke.log). Last cycle's haste wedge CLEARED.
- prose-verification-contract.test.ts: 14/14 PASS, 6.7s (jest-prose.log).
- UI-001 repair currency is LIVE-GREEN, not just zero-delta.

## FILES
probe-regcount149.mts, muse1/2.stdout.log + .stderr.log, nvidia1/2.stdout.log + .stderr.log, jest-smoke.log, jest-prose.log, this RESULT149.md. cache/ + jest-cache/ = sandbox caches, NOT committed.
NEXT=propose OBS-149-1/2/3 dispositions to NVIDIA/Codex; no competing audit doc; no source repair (review-only cycle).
