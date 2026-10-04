# Muse independent review — Codex isolated readonly-browser candidate

AGENT=MUSE
CONSULTATION_ID=CODEX-ISOLATED-READONLY-BROWSER-20261004-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=MECHANISM_VERIFIED_GREEN__ISOLATED_CANDIDATE_ONLY__INTEGRATION_BLOCKED_ON_LISTED_CONDITIONS
RECOMMENDATION=APPROVE_WITH_CHANGES
REVIEW_DATE=2026-10-04
MUSE_HEAD=d1e2f53d700d08570b0bb3109a326be8f527999f
CANDIDATE=D:\Joe\worktrees\codex-readonly-browser-20261004 (detached f40 base + 21 copied dirty files)
SHARED_WRITE=DENIED (prior cycles: absolute path outside workspace; fallback file stands; Codex to import verbatim)

## Scope actually inspected (read-only; no candidate/NVIDIA/main writes, no runtime control)

- All 5 SHA-pinned files (helper + IntentParser + PlanningEngine + 2 tests), full text.
- Both owned patches vs baseline copies; manifest.json (21 inherited files).
- Owner logs: bounded-focused-final, focused, authority-focused, baseline-commerce,
  type, build, gate x10, testenv x3, gate-results.json.
- Independent jest reruns on exact candidate bytes with CWD + cache + TEMP
  redirected to muse-worktree scratch (foreign-tree logger EPERM workaround):
  tmp/codex-browser-review/muse-rerun-22b.log,
  muse-rerun-inherited.log, muse-rerun-authority.log, muse-probe.log.
- Downstream metadata consumers (answerOnly/readOnly/noFileChanges reads).
- Standing checks: NVIDIA HEAD f40 intact, f40 3 files unmodified, F1 still present.

## SHA verification — all pins match current bytes

- bounded-read-navigation.ts F59A5154... / IntentParser.ts 1D5CB279... /
  PlanningEngine.ts A170175E... / bounded test FEC5CD52... / live test 9BCB4F9C...
  all match candidate-source.json exactly.
- Baseline IntentParser/PlanningEngine/requested-action copies match manifest.json.
- fixed/ copies match current candidate bytes.
- IntentParser actual diff = 12 insertions, matches owned patch (import + early-return).
- Candidate bytes frozen since 14:13Z (before this review).

## What I independently verified GREEN on exact candidate bytes

1. Focused suites: 22/22 PASS, exit 0 (bounded 15 unit + 4 transfer + live 3).
   The live 3 (previously 2FAIL/1PASS on my independent rerun) are now 3/3.
2. My NEEDS_EVIDENCE gate criteria are MET: single shared helper
   (boundedReadNavigationUnderFileConstraint) consulted by BOTH guards —
   the REQUIRED shared helper, not optional duplication.
3. Genuine no-execution still denies: 'Answer only' control + 12 helper
   negatives + 3 dual-boundary negatives all green (quoted spec, fenced,
   multi-URL, build-request, login/fill/click/upload/write-file cases).
4. Mutating browser actions still denied under no-write (login/fill/submit/
   upload negatives green at both boundaries).
5. Transfer case (different URL/title/wording) routes existing browser_launch
   through both boundaries with noFileChanges preserved — general fix, not a
   prompt patch.
6. E1 mechanism VALIDATED in these bytes: ANSWER_ONLY_EN contains
   `do\s+not\s+(?:execute|run|build|create|implement|write)` so the live
   prompt arrives via isAnswerOnly (my correction); helper handles both flags
   since the guard calls it when either is set. 'Do not use any paid
   provider' trips neither list, so the live prompt proceeds — confirmed.
7. No-write 'modify' spelling: helper permits it and routing suite stays
   12/13 — no flip in either direction.
8. Inherited failures UNCHANGED (same names, untouched files):
   routing commerce flow (expects browser_run, gets project_pipeline) fails
   identically on baseline log and candidate; authority 3 (Arabic no-file,
   Explain-then-build Arabic, Recording verb) fail inside requested-action.ts
   which the candidate does not touch. Independent counts: routing 12/1,
   authority 35/3 — match consultation exactly.
9. Downstream metadata SAFE: zero `.answerOnly` readers exist in
   core/orchestrator/quality/modules — the flag is write-only informational
   today, and the candidate sets the correct values (false/true/true) anyway.
10. Types: 8 errors in type.log, ZERO in the 3 owned production files
    (pre-existing test-file diagnostics in untouched files).
11. Build PASSED (esbuild 5.8mb). guard:architecture, guard:package-scripts,
    test:joe:engineer-flow PASS per owner receipts.

## Evidence nits (claims hold; arithmetic reconciled, not errors)

- N1: authority-focused.log totals 56, not 60, because it predates the 4
  transfer tests (15+3+38=56). Final 22-run is separately logged. Counts agree.
- N2: baseline-commerce.log shows 12 skipped (filtered run) but the single
  failing test is byte-identical to the candidate failure. Claim holds.
- N3: my first two rerun attempts hit foreign-tree logger EPERM (sandbox
  cannot write candidate api/logs); clean exit-0 reruns used scratch CWD
  since the logger path is CWD-relative. Results above are from exit-0 runs.

## Residual risks / limitations (non-blocking, record for integration)

- R1: quoted MID-sentence context navigates
  ('Open https://example.com as shown in "the docs"' -> true). Only the
  leading-quote explanatory case is pinned denied. Acceptable for a narrow
  exception (still an explicit open imperative); note, don't expand scope.
- R2: the mutation-word list is heuristic defense-in-depth, not a security
  boundary ('DROP TABLE' text -> true, but prompt text is inert:
  browser_launch takes the URL only). The real boundary is ToolService +
  browser_launch read-only contract — verify that contract at integration.
- R3: hasEarlyDenial self-match (constraint verb counted as affirmative,
  my earlier finding) is NOT addressed by this candidate. Latent for other
  prompts; file as follow-up, do not scope-creep this fix.
- R4: schemeless URLs / Arabic / negated-mutation wording stay denied
  (fail-closed, as declared). No new coverage claimed — correct.
- R5: duplicate identical URLs denied (urls.length!==1). Conservative; fine.

## Required changes before integration/adoption (blocking)

- C1: 4 remaining gate reruns owed with synthetic test env (missing-name,
  number-to-string, self-healing failure/success). Current failures are
  JWT-env ('JWT_SECRET must be set'), not source — but PASS receipts are
  still required, not inferred. 3 testenv PASS already logged.
- C2: inherited 4 failures (commerce + 3 authority) need owner disposition.
  They block exact integration per the consultation; do NOT weaken them.
- C3: re-manifest at integration time. The 21 copied dirty files may have
  drifted from live NVIDIA bytes (53 dirty paths, active lane). Integration
  must compose the 5 owned files dirty-preserving onto current main bytes —
  never overwrite NVIDIA's IntentParser/PlanningEngine lane or blind-copy
  the whole candidate tree.
- C4: Muse re-review of the INTEGRATED bytes. This review covers the isolated
  candidate only, not a merged tree.
- C5: source-bound loading + official5002 UAT replay (Codex-owned) only after
  C1-C4. No UI PASS claimed by this review; none attempted.

## Ownership note (for coordinators, not a reassignment)

- The NVIDIA owned-rework assignment (REAL5002-...-NVIDIA) is still PENDING
  owner acknowledgement; this Codex isolated candidate is a parallel path
  to the same contract. Exactly ONE fix must integrate (Codex candidate OR
  NVIDIA repair composed dirty-preserving) — do not let two diverged
  guards land. NVIDIA retains CLI/schema/verification + live dirty lane.
- No competing Muse implementation written or planned. This review only.

## Overlap / preservation

- Zero overlap: Codex isolated tree, NVIDIA live lane, Muse review lane.
- No writes to candidate/NVIDIA/main trees; no runtime start/stop; no
  provider calls; no UAT attempted (both health checks skipped this cycle
  to leave owned verification undisturbed — prior standing receipt stands).

## Standing confirmation (this cycle, read-only)

- NVIDIA HEAD still f40f6100; f40 3 files unmodified; F1 bare
  utility|script|tool still present (OPEN); dirty lane preserved (53 paths).
- Prior reviews stand: f40 APPROVE_WITH_CHANGES (F1/F2 blocking),
  browser-contract NEEDS_EVIDENCE gate now has a qualifying candidate
  pending C1-C5.
