# Muse independent review — Codex isolated Arabic authority rework (C2 partial)

AGENT=MUSE
CONSULTATION_ID=CODEX-ARABIC-AUTHORITY-REWORK-20261004-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=MECHANISM_VERIFIED_GREEN_ON_PINNED_SHAPES__ONE_SUBSET_GAP_REQUIRED__ISOLATED_CANDIDATE_ONLY
RECOMMENDATION=APPROVE_WITH_CHANGES
REVIEW_DATE=2026-10-04
MUSE_HEAD=8cde7eb1388f1fcb9ed48c44088c0a1d9b5341b8
MUSE_BRANCH=muse/joe-development
MUSE_TRACKED_TREE=CLEAN (0 tracked dirty; 1082 untracked preserved, nothing deleted)
CANDIDATE=D:\Joe\worktrees\codex-readonly-browser-20261004 (detached f40 + 21 copied dirty files + arabic delta)
SHARED_WRITE=DENIED (expected: absolute path outside workspace; this fallback stands for verbatim import)

## Scope actually inspected (read-only; no candidate/NVIDIA/main writes, no runtime control)

- requested-action.ts full text (398 lines) + arabic-authority-constraints.test.ts full text.
- Owned patch vs independently recomputed diff (hash-compared, see 6 below).
- All 8 SHA pins in candidate-arabic-source.json + manifest.json provenance chain.
- Live NVIDIA bytes for delta base + authority test (read-only hash compare).
- Owner logs: arabic-authority-focused, arabic-constraints-first (RED), arabic-constraints-final,
  arabic-authority-final-v2, base authority-focused, arabic-v2 type + all 10 gates + build.
- Independent jest rerun of all 4 suites on exact candidate bytes (CWD/cache/TEMP redirected
  to muse-worktree scratch): tmp/codex-arabic-review/muse-rerun-arabic69.log.
- 11-case observation probe + 3-case char-code-verified follow-up probe on exact bytes:
  tmp/codex-arabic-review/probe-arabic.test.ts, probe-wasf.test.ts, muse-probe-arabic.log.
- Standing checks: NVIDIA HEAD, f40 files, base-candidate 5-file hashes (all re-confirmed).

## SHA verification — all pins match current bytes

- requested-action.ts 3BCF65EF... / arabic test F7B333D1... / authority test 650C11CC... /
  helper F59A5154... / IntentParser 1D5CB279... / PlanningEngine A170175E... /
  bounded test FEC5CD52... / live test 9BCB4F9C... — 8/8 match candidate-arabic-source.json.
- Base 5 files byte-identical to base-review pins (browser delta untouched by arabic work).
- Provenance chain CLOSED: manifest baseline 91C75403 == before-arabic copy == baseline copy
  == LIVE NVIDIA requested-action.ts right now (zero drift in this file).
- Authority test 650C11CC == LIVE NVIDIA bytes: existing test unweakened, byte-proven.
- Owned source mtimes 15:18:09Z predate all v2 gates (first 15:19:29Z) and pins (15:20:55Z).

## What I independently verified GREEN on exact candidate bytes

1. Focused rerun: 68 passed / 1 failed / 69 total (exit nonzero only from the known
   inherited failure): arabic 9/9, bounded 19/19, live 3/3, authority 37/38.
2. Two closures CONFIRMED: base log failed exactly [Arabic no file changes,
   Explain-then-build Arabic, Recording verb]; now only Recording fails.
3. Recording failure mechanism traced to untouched code: 'Record expenses with amount,
   category, date' has no indicator token (amount/category/date not in RECORDING_INDICATOR)
   and no affirmative/desire verb match, so it returns 'no requested action detected'.
   Pure-English input, no denial/Arabic path involved — inherited, unchanged.
4. RED->GREEN provenance genuine: first.log shows the exact 3 denial-override failures
   (affirmative returned where denial required) before the priority guard.
5. 68-vs-69 log arithmetic reconciled: 9th test (أي variant) added between the two final
   runs; pinned file is the 9-case version. Not a discrepancy.
6. Patch fidelity PROVEN: independently recomputed before->live diff body hashes
   DDD05123... == owned patch body, 49/49 lines. (First attempt hit PowerShell UTF-16
   capture mojibake on Arabic lines; redone via git --output bytes. Method note for team.)
7. Types: arabic-v2-type.log byte-identical to base type.log (B5633A76); all 8 diagnostics
   in untouched verification-contract-gaps.test.ts; ZERO in owned files or new test.
8. V2 gates COMPLETE since consultation: all 10 exit-0 receipts verified present with PASS
   verdicts in tails (guards, engineer-flow full 9-check PASS, 5 self-fix, 2 self-healing)
   + build 5.8mb PASS. Owner receipts verified, not independently rerun (same standard as
   base review). All ran after source finalization (mtime evidence above).
9. No global-denial weakening: 'Build a calculator. Do not create a database' stays
   affirmative (negative-constraints path preserved, probe-verified); new no-file priority
   only ADDS denials in the fail-closed direction.
10. Priority guard covers pinned shapes: اشرح فقط / الرد فقط / بدون تنفيذ / بدون أي تنفيذ /
    بدون أي تعديل على الملفات + build all deny (suite + probe). الرد بدون تنفيذ denies
    via transitive بدون-match (probe-verified).
11. Quoted denials (EN and AR) do NOT trigger: START_BOUNDARY excludes the quote char, so
    quoted spec text stays non-binding and build proceeds. Incidental quote-awareness from
    pre-existing boundary design; observed, arguably correct, no change requested.
12. Empty input: clean 'no requested action', no crash.

## F1 REQUIRED before integration (blocking, small, same-file)

- Bare `وصف فقط` + affirmative + container returns AFFIRMATIVE (denial overridden).
  Char-code-verified probe: bare `وصف فقط` (codes 1608,1589,1601,32,1601,1602,1591)
  -> denial:true/answerOnly:true; `وصف فقط ثم ابني متجر` -> aff:true/denial:false via
  'affirmative build verb + container'. explicitArabicDenial subset omits bare وصف فقط
  (only وصف بدون تنفيذ is covered transitively), and branch-1 Arabic denialPhrases are
  still Chinese placeholders, so nothing catches it.
- This is the exact failure mode under repair (detected denial overridden), in the guard
  under review. Fix: add `وصف\s+فقط` to explicitArabicDenial at BOTH sites + 1 pin test.
  NOT a regression (pre-delta outcome identical — nothing caught Arabic then), but the
  claimed 'explicit Arabic denial priority' is incomplete without it.
- F1 must close before integration; Muse re-verifies amended bytes (fast follow-up).

## Residuals / follow-ups (non-blocking, record for owner)

- R1: diacritized denial (بدون تَنْفِيذ) is blind -> affirmative via explain-then-build.
  Pre-existing normalizer limitation (same outcome pre-delta via affirmative-verb path).
  Needs diacritics-hardening as separate scope, not this delta.
- R2: second guard hunk (lines 283-329) is UNREACHABLE: line 265 returns every hasDenial
  case first and hasDenial is const, so `hasDenial && ...` at 283 can never fire (331 too).
  Harmless defense-in-depth; the 3 fixed overrides credit hunk 1 only. Keep or remove.
- R3: branch-1 denialPhrases Arabic entries still Chinese placeholders (line 123);
  compensated by the new guard for common shapes. Hygiene follow-up.
- R4: ANSWER_ONLY_AR retains dead `اشرح هذا 那些...` alternative. Harmless; hygiene.
- R5: inherited failures still OPEN per C2: Recording indicator gap + commerce flow +
  8 type diagnostics in verification-contract-gaps.test.ts. Need owner disposition;
  do NOT weaken.

## Conditions update (base C1-C5 + this delta)

- C1 (v2 gates+build on new source): PASS RECEIPTS present and verified 10/10 + build.
  Independent gate rerun not done; focused 69 independently rerun. C1-CLOSURE for v2
  bytes is supportable on receipts + mtime ordering + my focused rerun.
- C2 (inherited failures disposition): still OPEN (Recording + commerce + type).
- C3 (re-manifest at integration): requested-action.ts zero-drift vs live NVIDIA, but
  full 21-file re-manifest still owed; integrate dirty-preserving, never whole-tree copy.
- C4 (Muse re-review of integrated + F1-amended bytes): REQUIRED, not done.
- C5 (source-bound loading + official5002 UAT): REQUIRED, Codex-owned, not attempted here.
- F1 (وصف فقط): REQUIRED before integration (this review).

## Ownership / overlap / preservation

- No competing Muse implementation written or planned. This review only.
- Zero overlap: Codex isolated tree, NVIDIA live lane, Muse review lane.
- No writes to candidate/NVIDIA/main; no runtime start/stop; no provider calls;
  no UAT attempted. NVIDIA HEAD re-confirmed f40f6100 read-only this cycle.

## Standing confirmation (this cycle, read-only)

- NVIDIA HEAD still f40f6100; prior base-review position stands (APPROVE_WITH_CHANGES).
- This delta: APPROVE_WITH_CHANGES with F1 + C2-C5. Mechanism green on pinned shapes;
  one subset gap must close; integration still gated.
