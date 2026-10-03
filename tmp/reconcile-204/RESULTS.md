# M204 reconciliation probe — RESULTS (Muse HEAD exact bytes, 2026-10-03)

Provenance: MUSE_HEAD=e17bd1b4e5a6622a0e7b2c53f61a3f8bebfa6b34 (tracked clean;
zero Joe source delta). plan-tools 5EF3E108…85CC and ledger 0AD84299…A672 match
the c203 pins; PhaseExecutorTool 81512CC9…CD13; ToolService F8608F51…D3515.
Probe zz-muse-contract204.probe.test.ts 5CE62DF6…C9D6 (with faithful-mock fix).

Method: jest probe, real PhaseExecutor + real sanitizer + real ledger, mocked
executeTool (ok:true) + REAL TOOL_ALIASES via requireActual. Probe file lived
in api/src/__tests__/ only during runs; removed after. Runner:
`node node_modules/jest/bin/jest.js zz-muse-contract204 --runInBand`
with TEMP/TMP/cache redirected into tmp/jest-temp-204 (sandbox denies the
default per-user temp dir). No tool executed, no network.

## Actuals (run2 and run3 byte-identical; 5/5 PASS both)

- M1 structured read_file, no note, checker mocked ok:
  ok=true status=completed passedReceipts=1. PREDICTION CONFIRMED.
- M2 structured read_file + verificationNote object:
  ok=true status=completed passedReceipts=1, no verification_unavailable.
  PREDICTION CONFIRMED. Executor ignores the note entirely (zero
  'verificationNote' hits in PhaseExecutorTool.ts).
- M3 unknown_tool object verifier:
  ok=false status=partial
  error=verification_unavailable: unsupported verification tool contract.
  PREDICTION CONFIRMED (after mock correction; see below).
- M4 sanitizer + accepted structured checker + planner note 'planner-note-x':
  tool=read_file, note preserved as-supplied ("planner-note-x").
  PREDICTION CONFIRMED. Muse line has NO note-overwrite invariant.
- M5 sanitizer + structured read_file of unproven path docs/architecture.md
  (phase produced app/index.js): rewritten to read_file app/index.js,
  note.task='Verify architecture doc', downgradedTo present.
  PREDICTION CONFIRMED.

## Mock-fidelity correction (run1 4/5 -> run2/3 5/5)

Run1 M3 crashed with `Cannot read properties of undefined (reading
'unknown_tool')` -> fatal_error. Debug probe isolated the thrower:
resolvePlannedTool at plan-tools.ts:234 (`TOOL_ALIASES[name]`) because the
probe mocked ToolService with executeTool only, leaving TOOL_ALIASES
undefined. ToolService.ts:212 exports a real TOOL_ALIASES map, so this was a
MOCK artifact, not a product bug: registered names resolve at :232 before the
alias leg, which is why the committed suites (same mock shape) never tripped
it. Fix: preserve the real TOOL_ALIASES via requireActual in the mock. No
product change made or needed. Standing warning for all lanes: any test that
mocks ToolService without TOOL_ALIASES will crash on unregistered names.

## Reconciliation table (Muse line @e17bd1b4 vs NVIDIA line @02a37c9b)

| case | Muse line (this probe) | NVIDIA 02a line (F5/c199 evidence) | verdict |
|---|---|---|---|
| structured read_file, no note | completed + receipt (M1) | completed (positive controls) | AGREE |
| structured read_file + note | completed, note ignored (M2) | partial + ok=false (wasOriginallyProse) | DIVERGE — owner must choose: note-as-provenance (02a) or note-ignored (Muse); F4 explicit-marker proposal resolves cleanly |
| unknown/non-checker object | partial + verification_unavailable + ok=false (M3) | partial + same error + ok=false (F5) | AGREE (rejection shape identical) |
| sanitizer note handling | planner note preserved as-is (M4) | note overwritten (:1017 invariant) | DIVERGE — same decision as above; composed commit must define ONE note contract |
| structured read of unproven path | rewritten to real phase output + downgrade note (M5) | unknown (not probed on 02a) | OPEN — 02a owner should state behavior; Muse behavior is the conservative reference |
| prose string to gate | completed on tasks, no receipt (committed) | n/a (02a expects sanitizer to rewrite/drop first) | COMPLEMENTARY — different layers, same fail-safe direction |

No composed commit exists yet; NOTHING here is adoption evidence. Both
CRITICALs stay OPEN. The composed Main/Muse verification commit must resolve
the two DIVERGE rows explicitly (recommendation stands: explicit
verificationProvenance marker per F4, never note-presence inference).
