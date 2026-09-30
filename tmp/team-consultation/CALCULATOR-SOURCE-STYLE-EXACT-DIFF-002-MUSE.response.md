# Muse independent review — CALCULATOR-SOURCE-STYLE-EXACT-DIFF-002
AGENT=MUSE
CONSULTATION_ID=CALCULATOR-SOURCE-STYLE-EXACT-DIFF-002
STATUS=REVIEWED_BY_MUSE
POSITION=VERIFIED_EXACT_DIFF_CONDITIONAL_ACCEPT
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=ea5e5173
MUSE_BRANCH=muse/joe-development
MUSE_TRACKED_TREE=CLEAN
CANDIDATE_WORKTREE=D:\Joe\worktrees\codex-nvidia-provider-ui
CANDIDATE_BRANCH=codex/nvidia-provider-ui
CANDIDATE_COMMIT=f61fe8aa4ef27d26b3f425b8a7a0c62a95b8c98d
CANDIDATE_PARENT=a8e5877cb62e3339c594338002c6f1fe520a1811
CANDIDATE_MESSAGE=fix(joe): verify calculator wiring and supply applied style evidence
UPDATED=2026-09-30
SHARED_FILE_WRITE=BLOCKED_ABSOLUTE_PATH_OUTSIDE_WORKSPACE_SHARED_STATUS_LEFT_PENDING_REVIEW
SHARED_WRITE_PROOF=Muse attempted edit_file append on the shared consultation this cycle; tool refused (absolute path outside workspace). This workspace file is authoritative for verbatim bridge import.
TRANSPORT=If shared write denied, Codex may import this file verbatim after transcript verification. Never infer beyond this text.

## Reviewed file hashes (SHA256, committed content = reviewed content)
presentation-context.ts=3B5E3CA9AD9B57DFC4E19594AEA8E1D03318E3BBB9E066AB36D1DFB85FC25F58
ReactProjectTool.ts=70E933897F24A0FBBA2FCB0190BD488E0C0B8384ECE119F8D211ABA01FC704B9
app-blueprints.ts=1E792AE22E174DA9017C904FE130DDD9150E340AEACED096A8B18F5B23CB553B
applied-stylesheet-evidence.test.ts=95CC46CDCF65CDA0A41226DE5B1B0E737956A6668477D8FA895CD47A68A248F9
calculator-engine.test.ts=E8550DEA16BDC7B1731824E8BB4AB07336DAE918487211F93B55C43758CAA627
presentation-context.test.ts=E1F98642EC05C7318A4C47A19F5F32F0A3FFC48A8306333C233AE58E9D74A520

## Scope
REVIEWED=f61fe8aa exactly (7 files, +1707/-26): the 3 source files above,
calculator-engine.test.ts (+966), presentation-context.test.ts (+44),
applied-stylesheet-evidence.test.ts (new, 67 lines),
a-capability-is-not-a-column.test.ts (1 expectation corrected).
NOT_REVIEWED=candidate dirty/out-of-scope files (row-image.ts,
ImageGenerationTool.ts, verify_pictures_are_fetched.ts,
CommandComposer.tsx, creative-safety.test.ts). They were correctly EXCLUDED
from f61fe8aa; no scope mixing in the commit. No competing implementation
by Muse; candidate tree untouched (status/log re-verified after review).

## Diff-vs-claim: commit message is accurate
"verify calculator wiring" = calculatorSourceCapabilities abstract
interpreter + CALCULATOR_FEATURE_RULES + calculatorFeatureCovered +
uncoveredFeatures routing + 31 connected-vs-broken fixture tests.
"supply applied style evidence" = readAppliedProjectStylesheets
(import-graph provenance) + 8KB bounded domain projection +
non-records authorContext wiring + 10 stylesheet tests. No hidden
behavior change found outside these two claims; weather/records code
paths byte-identical in behavior (same functions, same args).

## Implementation assessment (read in full, not sampled)
1. calculatorSourceCapabilities (~420 lines, app-blueprints.ts:3886+):
   symbolic execution over the authored component — useState/setter
   binding, per-control handler invocation, display/digits/operations/
   arithmetic/equals/decimal/chained/zero-error/clear/allBound/style/
   responsive capabilities. Fail-closed throughout: source >650KB,
   80k tick budget, depth-12 cap, unsupported loops/switch-fallthrough/
   finally shapes throw -> empty capability set (uncovered, never a
   false pass). Mount analysis only follows returned render paths.
   Unicode operator handling verified byte-exact (U+2212/U+00D7/U+00F7
   match the captured FIELD_CALCULATOR fixture).
2. readAppliedProjectStylesheets: index.html module scripts -> TS
   import graph (type-only skipped) -> css-tree @import walk.
   realpath containment, lexical+junction escape refused, depth/file/
   byte budgets, fail-closed to []. Matches its 4 tests exactly.
3. presentationShellContext options: includeDomainStyles + domainSource,
   8KB byte budget on complete CSS nodes (multibyte-safe), PARTIAL
   CSS EVIDENCE marker, relevance-first selection with cascade-order
   restore. All 6 new tests assert real properties (bound, marker,
   parse-validity, prioritization, order, responsive groups).
4. ReactProjectTool: non-records authorContext gains EXISTING
   PRESENTATION SOURCE EVIDENCE (App.jsx + app.css + engine-if-present)
   for initial authoring AND repairs; instruction sentence mirrors the
   records rule (B2) plus partial-evidence/touch/keyboard guidance.
   Unguarded readFileSync matches the pre-existing records-path pattern
   (same call shape) — no new risk class. sourceContext applied only
   for engine==='calculator' at both call sites (repair + fidelity
   gate). Minimal, scoped.
5. Column test 4->3 ('sortable by grade'): LEGITIMATE, not weakening.
   No parser hunk exists in f61fe8aa; independent base run proves the
   old 4-label expectation was ALREADY RED at parent a8e5877c while the
   parser yielded 3. Stale-test correction, verified both directions.

## Decision CONDITIONS checklist (CALCULATOR-SOURCE-STYLE-EVIDENCE-001-CODEX)
1. No stock-template success override: MET (react-app-templates untouched).
2. No manual generated-output styling: MET (source-only commit).
3. Positive/negative disconnected/no-op fixtures: MET (31 tests:
   disconnected controls, no-op digit, unused arithmetic, literal-false
   branch, boolean display, unused component, JS-string CSS,
   absent-descendant selectors, unproved mount, unreachable inline
   styles/catch, switch fallthrough, decimal-label-only).
4. <=8KB partial marker/relevance preserving cascade: MET (see 3 above).
5. All required AGENTS gates: NOT YET (focused+tsc+pipeline verified by
   Muse; full battery pending with owner).
6. Fresh 5002 UAT (every control/error/arithmetic/responsive/auto URL):
   NOT YET (backend still pre-fix per execution board; no replay).
7. Independent exact ACCEPT: THIS FILE (conditional, see verdict).

## Muse E1-E5 conditions (from EVIDENCE-001 review)
E1 fail-closed gate stays + browser proof added: MET on source half
(gap strings still drive repair loop + fidelity gate; no QA bypass).
Browser half awaits UAT.
E2 every-control contract: MET on source half (per-control handler
execution + allBound). Runtime click/read/assert half awaits UAT.
E3 byte-bounded projection + truncation marker: MET (8KB, marker, tests).
E4 unresolved verdicts name evidence class: NOT IMPLEMENTED (gaps are
still word strings; self-fix target still coarse). Follow-up, not an
integration blocker (not in decision CONDITIONS).
E5 records label-only negative control: NOT IMPLEMENTED (records path
untouched). Pre-existing separate loophole; needs an owner, not this batch.

## Residual limitations (all fail-closed; none is a false-pass)
L1. Coverage certifies the hooks idiom: useReducer/class/no-useState
    components are uncovered by construction. A valid non-hooks
    calculator would loop to honest unresolved, not false success.
    Follow-up: pin the idiom in IMPLEMENTATION CONTRACT or widen the
    analyzer. Watch U1 for this signal.
L2. Ask-patterns include long request-shaped phrases; paraphrased
    compound obligations (e.g. reworded division-by-zero) stay
    unresolved via the remainder rule. Conservative by design; reworded
    calculator prompt recommended as an extra UAT probe (not replacing U2).
L3. style/responsive are presence gates (property exists on a rendered
    class), not size proof: 21px buttons WITH padding pass source.
    Large-control proof can only come from U1 browser measurement.

## Overlap / conflicts / risks
- NVIDIA dirty CLI 6 lines (hasExplicitRecordSchema ~3239) vs this
  commit (coverage ~3886+/4358/4370): disjoint regions, same file.
  No action now (isolated branch); rebase-check required at integration.
- uncoveredFeatures feeds repair + fidelity gates: for non-calculator
  engines behavior is identical (spread copy is neutral; calculator
  branch guarded). Proven by weather/records/pipeline green below.
- 5 failures in adjacent battery are PRE-EXISTING at parent (proven by
  detached base worktree run, removed after): fih:87, verb-phrase:100,
  :121, page-criterion:69, :83. f61fe8aa adds ZERO new failures and
  fixes 1 stale test. The 5 need a separate owner (candidate-base
  origin; main-vs-base-commit attribution not traced this cycle).
- Maintainability: the analyzer is the deepest new logic in this area
  (~420 lines). Justified: regex rules WERE the defect; structural
  evidence was the agreed direction. Calculator-scoped; documented
  fail-closed; no new deps. Security: reads stay in project root,
  budgets bounded, no secrets/network/tenant-state change; evidence
  labeled data-not-instructions; multi-user safe (per-project).

## Checks run by Muse (independent, this cycle)
- Focused: calculator-engine + presentation-context +
  applied-stylesheet-evidence + a-capability-is-not-a-column:
  4 suites, 87/87 PASS.
- Adjacent battery (22 suites: column family + weather + records):
  181/186; 5 failures attributed to base via detached-worktree
  rerun (base: 6 failed incl. stale column test; f61fe8aa: same 5).
- project-pipeline.test.ts: 58/58 PASS (matches Codex evidence).
- tsc --noEmit on candidate api: exit 0.
- Codex JSON evidence read: pipeline 58/58, preflight 70 pass/0 fail
  (18 pending/skipped) — consistent with independent reruns.
- No browser/UAT rerun by Muse (backend pre-fix; would repeat known
  failure). No Real Joe PASS claimed anywhere.

## Real Joe UAT (still required before VERIFIED/integration)
U1 same calculator prompt on refreshed runtime to terminal (auto URL,
large buttons measured, every control clicked, chained + div-by-zero).
U2 fresh unseen non-calculator transfer (same seams). U3 independent
verification. Plus recommended extra: reworded calculator prompt (L2).

## Verdict
RECOMMENDATION=APPROVE_WITH_CHANGES. The exact diff is accepted as the
correct bounded general repair: source-backed coverage replaces word
coverage for calculator; actual bounded stylesheet evidence replaces
filenames for non-records authoring; tests are genuine connected-vs-
broken contracts, not labels. Conditions: run the full AGENTS gate
battery; refresh the runtime; pass U1/U2/U3; file E4/E5/L1 as owned
follow-ups; coordinate the same-file NVIDIA hunk at integration.
This is NOT a final product ACCEPT and NOT an integration approval.
CALCULATOR status remains NOT_PASS until UAT evidence exists.
