# Muse independent review ADDENDUM — CALCULATOR-SOURCE-STYLE-EXACT-DIFF-002
AGENT=MUSE
CONSULTATION_ID=CALCULATOR-SOURCE-STYLE-EXACT-DIFF-002
STATUS=REVIEWED_BY_MUSE
POSITION=VERIFIED_EXACT_DIFF_CONDITIONAL_ACCEPT_WITH_EXPANDED_ATTRIBUTION
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=363e90ad
MUSE_BRANCH=muse/joe-development
MUSE_TRACKED_TREE=CLEAN_OF_NEW_SOURCE_EDITS (pre-existing untracked tmp only; no Joe source edits this cycle)
CANDIDATE_WORKTREE=D:\Joe\worktrees\codex-nvidia-provider-ui
CANDIDATE_BRANCH=codex/nvidia-provider-ui
CANDIDATE_COMMIT=f61fe8aa4ef27d26b3f425b8a7a0c62a95b8c98d
CANDIDATE_PARENT=a8e5877cb62e3339c594338002c6f1fe520a1811
CANDIDATE_HEAD_CONFIRMED_THIS_CYCLE=YES (HEAD still f61fe8aa; stat 7 files +1707/-26 matches)
APP_BLUEPRINTS_SHA256_RECOMPUTED=1E792AE22E174DA9017C904FE130DDD9150E340AEACED096A8B18F5B23CB553B (matches consultation handoff)
UPDATED=2026-09-30 (second independent Muse pass; supplements, does not replace, the prior committed response)
PRIOR_RESPONSE=PRESERVED_VERBATIM at tmp/team-consultation/CALCULATOR-SOURCE-STYLE-EXACT-DIFF-002-MUSE.response.md (committed 363e90ad)
SHARED_FILE_WRITE=BLOCKED_ABSOLUTE_PATH_OUTSIDE_WORKSPACE (re-proven this cycle: edit_file on shared consultation refused)
TRANSPORT=Codex may import this addendum verbatim after transcript verification. Never infer beyond this text.

## Why an addendum exists
The shared consultation gained a NEW section after the prior Muse response:
expanded direct-consumer regression (305 PASS / 21 FAIL initial; diagnostic
rerun: records-presentation-authoring PASS, wiring-policy 17 FAIL,
media-review-contract 3 FAIL) plus a claim that media AppKind/router/blueprint
exists in Muse but not in the candidate. This addendum independently verifies
the exact diff a second time AND attributes the new expanded failures. No
competing implementation; candidate tree untouched (read-only inspection +
test execution with cache/temp redirected into Muse workspace).

## R1. Exact-diff core RE-VERIFIED this cycle (not carried on trust)
- Commit/message/parent/stat re-read from candidate git: f61fe8aa, 7 files,
  +1707/-26. f61fe8aa is still HEAD; no drift since prior review.
- app-blueprints.ts SHA256 recomputed: 1E792A...CB553B — matches handoff.
- Symbols present at expected sites: calculatorSourceCapabilities :3886,
  CALCULATOR_FEATURE_RULES :4309, calculatorFeatureCovered :4332,
  uncoveredFeatures calculator routing :4390-4392.
- 8KB budget + PARTIAL marker verified at source
  (presentation-context.ts:143-144,169,175); relevance-first selection :165
  with cascade-order restore :174; includeDomainStyles/domainSource options.
- ReactProjectTool wiring verified: import :202, calculator-scoped
  sourceContext :1136, EXISTING PRESENTATION SOURCE EVIDENCE authorContext
  :6272, fidelity-gate call site :8227.
- Focused battery INDEPENDENTLY RERUN this cycle in candidate api
  (cache/temp redirected to Muse workspace; candidate source untouched):
  calculator-engine + presentation-context + applied-stylesheet-evidence +
  a-capability-is-not-a-column = 4 suites, 87/87 PASS (13.2s).
- tsc --noEmit on candidate api this cycle: clean, zero errors.
- Negative fixtures are genuine contracts, not labels (test names read):
  rejects disconnected controls / no-op digit / unused component /
  unsupported switch fallthrough / absent-descendant selectors; does not
  count unused arithmetic, literal-false branches, boolean display,
  unreachable catch, JS-string CSS, label-only decimal. The 'keeps the
  actual original stylesheet mismatch visible' test pins the real defect.
- Candidate dirty/out-of-scope files (row-image.ts, ImageGenerationTool.ts,
  verify_pictures_are_fetched.ts, CommandComposer.tsx, creative-safety
  test) remain correctly EXCLUDED from f61fe8aa. No scope mixing.

## R2. Expanded-regression attribution: all 20 diagnostic failures are PRE-EXISTING, zero caused by f61fe8aa
Evidence read: C:\Users\home\.codex\visualizations\2026\09\24\01a0d4d4-8388-78b2-b65d-b221d85695b8\calculator-expanded-regression-diagnostic.json
(3 suites, 196 tests, 20 failed / 176 passed; failing names enumerated).
Static attribution (test+code identical => same result; no base rerun needed):
1. The three suite files are BYTE-IDENTICAL between base a8e5877c and
   f61fe8aa (git diff on media-review-contract, wiring-policy,
   records-presentation-authoring = empty).
2. app-blueprints hunks touch ONLY ~3877+ (new calculator analyzer,
   ~466 added lines) plus calculator-guarded routing: 160-char feature
   cap applies ONLY when engine==='calculator' (80 for all others);
   uncoveredFeatures non-calculator filter logic is line-identical
   (spread copy is neutral); FEATURE_RULES_BY_ENGINE change is type-only
   widening (runtime reads only rule.asked); calculatorSourceCapabilities
   is invoked ONLY for engine==='calculator'.
3. Media code regions untouched: AppKind union :40, media router regex
   :258, case 'media' blueprint :1263 — none in any hunk.
4. The failing suites call uncoveredFeatures ONLY with non-calculator
   engines (media bp.engine, 'records', 'social'); media tests never
   reference authorContext/presentation evidence/calculator symbols;
   wiring-policy likewise (single uncoveredFeatures call, engine
   'social'). The authorContext evidence-text change is model-input-only
   and asserted by no failing suite.
5. records-presentation-authoring (the suite covering the touched style
   seam) PASSES fully at f61fe8aa.
CONCLUSION: f61fe8aa adds ZERO new failures and fixes one stale test
(column 4->3, already proven stale at base last cycle). The 17
wiring-policy failures (feed server, chat history, roles, domain
packaging, etc.) and 3 media failures belong to SEPARATE defect families
with base-level origin; each needs its own owner. Do NOT weaken any of
these tests; do NOT block f61fe8aa on them; do NOT claim f61fe8aa fixes
them. A live base rerun is welcome as audit confirmation but cannot
change the construction: identical test + identical exercised code.

## R3. CORRECTION: media AppKind/router/blueprint exist in BOTH trees
The "absent from candidate" phrasing is inaccurate at blueprint level:
- Muse: AppKind 'media' :40, router regex :274, case 'media' :1279,
  'Media Review Board' :1281 (introduced by Muse-history f8cf0852).
- Candidate: AppKind 'media' :40, router regex :258, case 'media' :1263,
  'Media Review Board' :1265. Present, same shape.
The 3 media failures are classification/behavioral (detectAppKind says
application, not marketing page; fields/behavior; image-path/rejection),
in code identical at base. They are a REAL separate gap (contract suite
written against behavior neither tree delivers), NOT a candidate-vs-Muse
presence gap at blueprint level. If a narrower absence exists (e.g. a
router entry in another file), the claim must cite the exact file/lines;
as stated it does not survive source inspection. Preserve both trees;
assign a media-contract owner separately.

## R4. Default-path note (flagged, not a blocker)
presentationShellContext now applies the 8KB cap + new scope sentence to
ALL callers including records (previously uncapped). Existing suites are
green, so this is empirically safe, and the partial marker is semantically
an improvement (model is told evidence may be partial). Records shell CSS
is small so it keeps 'complete projected' evidence. No action required;
noted so a future truncated-records surprise is not misattributed.

## R5. Standing conditions from prior review (unchanged)
E4 (unresolved verdicts name evidence class) and E5 (records label-only
negative control) remain NOT IMPLEMENTED — file as owned follow-ups, not
integration blockers (not in decision CONDITIONS). L1 (hooks-idiom
coverage), L2 (paraphrase remainder), L3 (presence-not-size style gates)
stand; U1 browser measurement remains the only large-control proof.
Codex's 220-subset/10-gate claims were NOT re-verified beyond focused
suites + tsc; the full AGENTS battery remains the implementation owner's
duty. The expanded run correctly supersedes any 220-subset readiness
inference — agreed.

## Root cause (reaffirmed)
Word-vocabulary coverage + evidence-starved non-records authoring caused
the calculator terminal failure. f61fe8aa replaces both with source-backed
calculator coverage and bounded applied-stylesheet evidence through the
existing context seam. No calculator template, no renaming hack.

## Proposal errors / challenges (this cycle)
P1. Any lingering "220 PASS => ready" reading is superseded by the
    expanded 21-failure run — agree with the Codex note; keep the
    NOT_READY_FOR_INTEGRATION status until base attribution is recorded
    (this addendum supplies it for audit) + gates + UAT.
P2. "Media absent from candidate" as a blanket claim is wrong at blueprint
    level (R3); narrow it to exact failing behavior with file/line cites.
P3. Runtime refresh still awaits user confirmation; no UAT can proceed
    until the owned 5002 API refresh is allowed. No bypass attempted.

## Simpler alternatives
None simpler than the implemented seam exists; no new code proposed by
Muse; no competing implementation started. The weather-pattern mirror +
one-call-site evidence handoff already taken IS the minimal fix.

## Overlap with existing work
- NVIDIA dirty CLI 6 lines (hasExplicitRecordSchema ~3239) vs f61fe8aa
  regions (~3886+/4358/4370): disjoint; same-file rebase-check required
  only at integration time. No action now (isolated branch).
- Muse media blueprint (f8cf0852) present in both trees: shared-baseline
  content, not an integration conflict.
- Candidate out-of-scope dirty files: separate scopes, correctly excluded.

## Conflict / regression risks
- Non-calculator uncoveredFeatures behavior proven identical (R2.2);
  weather/records paths byte-identical in behavior.
- Default-path CSS cap empirically safe (R4); all touched-area suites green.
- 20 expanded failures pre-existing with separate ownership needed; no
  assertion weakening observed anywhere in f61fe8aa.
- Analyzer remains ~420 lines of new structural logic: justified (regex
  rules WERE the defect), calculator-scoped, fail-closed, no new deps.

## Maintainability / security impact
Unchanged from prior review: evidence-labeled context follows the records
precedent; reads stay in project root with realpath containment and
budgets; no secrets/network/tenant-state change; per-project evidence is
multi-user safe. Evidence carries data-not-instructions labeling.

## Required tests (before any integration)
1. Owner runs the FULL AGENTS battery on f61fe8aa (not just focused+tsc).
2. Media-contract + wiring-policy failures: record base attribution (this
   addendum's static proof offered for audit; live base rerun optional),
   assign separate owners; never weaken to green.
3. E4/E5/L1 filed as owned follow-ups.
4. Column 4->3 correction stands (stale-test fix, both directions verified
   last cycle); no further action.

## Real Joe UAT (still required before VERIFIED)
U1 same calculator prompt on refreshed runtime to terminal (auto URL,
measured large buttons, every control clicked, chained + div-by-zero).
U2 fresh unseen non-calculator transfer. U3 independent verification.
Optional extra probe: reworded calculator prompt (L2 paraphrase caution).
CALCULATOR status remains NOT_PASS. No product PASS claimed.

## Verdict
RECOMMENDATION=APPROVE_WITH_CHANGES. The exact f61fe8aa diff is accepted
as the correct bounded general repair with genuine connected-vs-broken
contracts; the 20 expanded failures are attributed pre-existing by
construction and must not be charged to this commit; the media-absent
claim needs narrowing (R3). Conditions: full AGENTS battery by owner;
separate owners for media + wiring-policy families; U1/U2/U3 after the
allowed runtime refresh; E4/E5/L1 filed; same-file NVIDIA coordination
at integration. This is NOT a final product ACCEPT and NOT an integration
approval. Preserve all Muse/NVIDIA/Codex work.
