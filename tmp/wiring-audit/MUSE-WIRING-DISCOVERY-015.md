# MUSE Wiring Discovery 015 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 15)
HEAD=f1421ec3 + this checkpoint (probe/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for code_understanding 16/16 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root fixtures created + removed by the probe;
NO network legs; model-backed legs run bounded under OFFLINE_MODE to
record the no-provider shape only) + static checker partition over the
trunk + pure-function verdict table over source-grounded shapes.
Full trunk probe ran 2x exit 0 with identical verdicts (36/36 legs;
the only run1-vs-run2 bytes that differ are console-log encoding
artifacts in the UTF-16 run-1 log parse — Arabic/em-dash mojibake —
while ok/error/shape/preview are identical).
EVIDENCE=tmp/wiring-audit/trunk_code.mts + trunk_code.json (run 2
machine-readable; run 1 preserved in trunk_code.log) +
trunk_code_run2.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-014.md (security LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

code_understanding = ambiguity_resolver, analyze_codebase, analyze_project,
auto_refactor, business_logic_parser, code_reviewer, codebase_outline,
compliance_validator, dead_code_detector, dependency_graph,
engineering_discovery, inspect_symbol, pattern_recognize, project_detect,
request_analyzer, self_confidence_evaluator (16). All 16 exist in the
live registry; no membership correction needed. This closes the checker
set: code_reviewer is the 14th and last allowlisted task-level checker
shape partitioned (14/14).

## New findings (all Muse-branch @ f1421ec3)

### F92. EliteTools F74 proven live on all 5 trunk siblings (MISMATCH #11 EXTENDED, LIVE 2x)

elite.dep-graph / biz-logic / compliance / ambiguity / confidence legs
-> ok:true + {} each, both runs, under OFFLINE_MODE with valid
inputs. The 013 chaos_test_plan false success is therefore the
family behavior, not a one-tool quirk: 6/8 EliteTools now
live-proven (chaos + 5 here); cloud_cost_estimator +
multi_agent_debate remain code-identical, other trunks. The two
guarded siblings (compliance_validator, self_confidence_evaluator)
still fail honestly on {} (fast pre-LLM legs) — their input guards
work; only the model-failure path is hollow. Code note: EliteTools.ts
imports isProviderFailure but never calls it — the intended guard
seam exists and is unwired; the repair belongs exactly there
(fail/throw on failure prose BEFORE the regex-extract-or-'{}').

### F93. codebase_outline reads are uncontained: cwd-rooted relatives + unrestricted absolutes (P2-006 EXTENSION, LIVE 2x)

execute() resolves relatives against process.cwd() with no
resolveToolPath/safePath/isWithinRoot and takes NO context param,
so it cannot bind a workspace even in principle
(CodebaseOutlineTool.ts:34-41). outline.relative-cwd
({filePath:'package.json'}) -> ok:true, totalLines 131: that is
api/package.json (131 split-lines; the session root holds NO
package.json — proof the read rooted at the API cwd, not the
session). outline.absolute-outside (OS-temp file outside the
session root) -> ok:true, exact 2-line read. Same defect class as
the pre-fix code_reviewer its own comment describes, and the 3rd
P2-006 shape (default root, upward escape, now no-context
resolver). Contrast in-trunk: all 3 AnalysisTools siblings use
safePath; code_reviewer binds activeRoot (F99: its outside leg
rejects). Fix direction (batch): accept context, resolve via
resolveToolPath, reject outside-workspace absolutely.

### F94. analyze_project missing-path -> ok:true + {status:'error'} (P2-004 9th instance, LIVE 2x)

analyze.missing -> ok:true, output {status:'error', message:'Path
does not exist'}: Analyst.analyze returns an error OBJECT for a
missing dir and the tool wraps it ok:true (AnalysisTools.ts:61-63).
Sibling inconsistency INSIDE one file: analyze_codebase missing
returns honest ok:false 'Path not found' (:100), project_detect
missing returns honest ok:false 'Path not found' (:202). A
verifier reading ok-only (the current mapping) receipts a
nonexistent path as passed. Fix: surface status:'error' as
ok:false like both siblings.

### F95. analyze_codebase offline fails via the ToolService backstop, not its own fallback (MISMATCH #9 4th instance, LIVE 2x)

codebase.offline ({path: fixture}, OFFLINE_MODE) -> ok:false, and
BOTH error and output.summary carry the Arabic no-provider
diagnosis. Mechanism: routeToModel RESOLVED failure prose (the #9
resolve-vs-throw shape), so the tool's own graceful-fallback catch
(AnalysisTools.ts:161-164, ok:true + '## Structure' summary) never
fired — it is DEAD on the resolve path — and the tool returned
ok:true + summary=prose; ToolService's apology-text scan then
flipped it to ok:false WITH full output (same shape as the 011/F62
model trio). Net-honest but fragile: the tool's own contract
promises ok:true here, and honesty depends entirely on the
backstop regex surviving paraphrase. This also corrects sweep2's
'honest offline fail' shorthand: the fail comes from the backstop
layer, not the tool. (codebase.remote leg: the ELITE-FIX redirect
branch returns ok:true + browser_run suggestion with NO network —
safe shape, recorded.)

### F96. pattern_recognize: decorative `language` + dead `filePath` input (P2-004 10th + MISMATCH #4 2nd instance, LIVE 2x)

required:['code','language'] but pattern.no-language ({code} only)
-> ok:true + patterns:[]: execute() validates only `code`, and a
missing language silently selects zero patterns
(AdvancedTools.ts:47-55). Separately, filePath is an accepted
schema property that execute() destructures and never reads:
pattern.dead-filepath-a (bogus /nonexistent/x.js) and -b (no
filePath) return BYTE-IDENTICAL outputs. filePath is the 2nd
planner-facing dead input after dead_code autoFix (MISMATCH #4).
pattern.seeded positive control is exact (Singleton x2 lines 2-3
+ Factory — F99).

### F97. auto_refactor writes with empty sideEffects; pure sorts silently dropped (P2-011/P2-020 family + P2-004 11th instance, LIVE 2x)

(a) The tool declares sideEffects:[] but PROVABLY rewrites files:
refactor.scratch byte-diff shows dedup + sort + console-strip
applied (changes 2/2, 92->56 bytes). First FILE-WRITING member of
the dishonest-empty-sideEffects family (P2-011 browser + P2-020
testing precedents). (b) Pure import reordering is computed then
DISCARDED: optimizeImports always rebuilds, but execute() keeps
result.code ONLY `if (result.changed)`, and `changed` measures
dedup-only (AdvancedTools.ts:279-285 + :348). refactor.sort-only
-> ok:true + changes:[] + diff:0 with the file byte-identical: a
no-op success — a planner asking to 'sort imports' gets a green
receipt for zero effect. The initial silent-REWRITE hypothesis was
REFUTED by the byte-diff (nothing written); the true defect is
silent-DROP. Fix: report sorts as changes or apply them; declare
the write side effect.

### F98. code_reviewer closes the checker set; hollow receipt + scope preference code-indicated (P2-019 7th hollow + P2-018 6th checker, LIVE + static)

isVerificationTool partition: code_reviewer is the ONLY
task-level checker of the 16 (gate opt-ins change nothing) ->
14/14 allowlisted shapes partitioned, checker set CLOSED
(013/F77 + 014/F87 notes now fully resolved). Output emits NO
url/reportPath/evidenceLocation (CodeReviewerTool.ts:195-215) ->
7th evidence-hollow receipt shape (P2-019). It takes
`projectPath`, and scopeRoot prefers the checker's path arg at
BOTH task level (:1570-1578) and gate level (:2372-2378) -> the
MISMATCH #10 nonce-scope extension is code-indicated for a 6th
checker (same projectPath shape as auto_tester's 013
indication). L5 live gate proof still pending (now 5 checkers:
quality_run/auto_tester/dep_audit/secrets/code_reviewer).
Review-quality note (not a defect): files are capped at 5
(files.slice(0, 5)) but filesRequested vs filesReviewed are both
emitted, so truncation is observable, not silent.

### F99. Positive controls: exact scores, containment both directions, byte proofs (LIVE 2x)

review.quick-seeded: score EXACTLY 57 (100-30-10-3) with exact
line/severity/category rows (critical secret L2, warning eval L4,
info console L6) — fully deterministic offline review, no LLM.
review.missing/empty-files/bad-score/gate-fail all honest with
exact messages; gate-fail proves minimumScore enforcement
(57 < 90). review.outside: session-outside file rejected ->
missingFiles -> ok:false (session binding WORKS via ToolService
context; error text does not distinguish outside from missing —
logs do). pattern.seeded exact; detect.seeded EXACTLY 1/1/1 with
the node_modules plant absent from all three lists;
symbol.seeded exact 3-line extraction; symbol.missing honest;
outline.seeded exact L2/L5/L6 + import row; outline.missing
honest; analyze.seeded ok:true Analyst shape; discovery.seeded
ok:true greenfield evidence; discovery.outside honest
path_outside_workspace; dead.missing fast pre-knip honest error
(no npx spawned); request.empty + both Elite empties honest
pre-LLM errors. Read-only fixtures byte-identical both runs; all
fixtures (+ outside marker) removed both runs. No approval gate
fired; no rate-limit hit.

### F100. Trunk selectability 16/16 rank-1; boot-defaulted members identified (static + registry)

SELECTABLE_BY_KEYWORD 16/16, ALL best-rank-1 on self-name goals;
0/16 router-excluded; 6/16 priority-listed (ambiguity,
analyze_codebase, codebase_outline, compliance, dependency_graph,
project_detect). Registry-vs-source comparison identifies 6 more
P2-003 members: the 5 trunk Elite tools + request_analyzer all
declare permissions [] in source but read ['read'] from the
registry (boot defaulting; 6 of the 21 census-defaulted).
dead_code_detector declares NO required array at all (schema
without required) + execute() takes no context and resolves via
no-arg getActiveRoot() ( DeadCodeTool.ts:11-19) — 4th P2-006
no-context instance, statically noted; positive leg stays
EMBARGOED (008 fixture design stands).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probe aborts unless 163)
TRUNK_STORIES=5/19 fully storied (code_understanding 16/16 LEVEL-4 +
static verification-compat; L5 live gate proof pending for its
checker) — files 10/10 + browser_ui 33/33 + testing_qa 6/6 +
security 3/3 + code_understanding 16/16 = 68 tools
TRUNK_CODE=16/16 SELECTABLE rank-1; 36/36 live legs canonical
(6 review + 3 refactor + 4 pattern + 2 detect + 2 symbol +
4 outline + 3 analyze/codebase + 2 discovery + 1 dead +
1 request + 8 elite), 2x verdict-identical; 11-shape
verdict table; fixtures removed both runs
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=11 confirmed (unchanged in number — F92/F95
extend #11/#9 with live proofs on new tools; F96 extends #4 with
a 2nd dead input; F98 extends #10 with a 6th code-indicated
checker; F93/F94/F97 are P2-006/P2-004-family extensions)
EXECUTABLE_NOT_VERIFIABLE=0 on 5 swept trunks (68/68 verdict-
mappable; Elite '{}'->passed + pattern-empty->passed +
refactor-silent->passed + analyze-error->passed are NON-CHECKER
constraints in the F88 class — safe today, must gate any
allowlist change) + 7 evidence-hollow receipt shapes
(+ code_reviewer) + 1 dead-reuse path (#10, now code-indicated
for 5 checkers) + skip-blind mapping (F75) + 1
missing-path-as-clean shape (F85) + 1 missing-as-error-status
shape (F94, ok:true wrapper)
CHECKER_SET=14/14 allowlisted task-level shapes partitioned
(code_reviewer closes the set; L5 live gate proof pending for 5)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- EXTENDED WIRING-P2-004 (3 more instances -> 11: analyze_project
  missing-as-error-status F94; pattern_recognize no-language
  empty-patterns F96; auto_refactor sort-only no-op success F97;
  + decorative-required `language` counting with the
  task_lifecycle/secrets required-vs-execute gap).
- EXTENDED WIRING-MISMATCH-#4 note (2nd planner-facing dead input:
  pattern_recognize filePath F96; repair rides with the P2-002
  single-winner/contract batch or a dead-input sweep).
- EXTENDED WIRING-P2-006 (2 more no-context shapes: codebase_outline
  cwd-rooted + uncontained absolutes F93; DeadCodeTool no-arg
  getActiveRoot F100 — both accept-context + resolveToolPath
  repairs; outline positive legs already live-proven).
- EXTENDED WIRING-P2-011/P2-020 family note (auto_refactor writes
  with sideEffects:[] F97 — first file-writing member; declaration
  repair belongs with the sideEffects-honesty batch).
- EXTENDED WIRING-P2-018 (scope fix covers code_reviewer,
  code-indicated via projectPath — F98; L5 live gate proof now
  pending for 5 checkers).
- EXTENDED WIRING-P2-019 (7th hollow shape: code_reviewer emits
  no evidence pointer — F98).
- EXTENDED MISMATCH #9 note (4th resolve-path instance:
  analyze_codebase offline honesty via backstop, own fallback
  dead — F95; repair is resolve-path honesty at the tool, not
  backstop dependence).
- EXTENDED MISMATCH #11 note (F74 live-proven 6/8 Elite tools;
  unwired isProviderFailure import marks the repair seam — F92).
- EXTENDED WIRING-P2-003 member list (6 trunk members identified:
  5 Elite + request_analyzer permissions []->read — F100).
- LIFTED nothing; embargoes hold (dead_code positive leg: npx
  knip; code_reviewer non-quick reviewType: LLM pass; all
  model-present behavior unprobed).

## Corrections to prior checkpoints

- 013/F74 '7 code-identical siblings' is now PARTIALLY live-proven:
  5/7 siblings (all code_understanding members) return ok:true+{}
  offline 2x; remaining code-only: cloud_cost_estimator,
  multi_agent_debate (other trunks).
- 013/F77 + 014/F87 'code_reviewer pending' is now FULLY
  partitioned + live-probed (checker set 14/14 CLOSED for the
  task-level static partition; L5 live gate proof outstanding).
- sweep2 'analyze_codebase honest offline fail' shorthand is now
  MECHANISM-RESOLVED: the fail is a ToolService backstop flip of
  an ok:true failure-prose summary, not the tool's own fallback
  (which is dead on the resolve path) — F95.
- The checkpoint-15 pre-registration hypothesis 'auto_refactor
  silently rewrites on sort-only' is REFUTED: nothing is written;
  the true defect is silent-DROP (computed rebuild discarded) —
  F97.
- Matrix tail counter (81) was stale by one against the actual 82
  rows (checkpoint 14 added a row without bumping the tail);
  corrected to 98 with this checkpoint's 16 rows.

## Limits / UNKNOWNs

- 14/19 trunks still unstories; vcs_repo=11 or
  build_generate=13 suggested next by impact (planner-adjacent
  write paths); L5 live gate proof for 5 checkers is the
  alternative next step (single-method batch).
- L5 live gate proof pending for quality_run/auto_tester/
  dep_audit/secrets_scan_repo/code_reviewer (5 checkers).
- dead_code positive leg embargoed (npx knip over a project).
- code_reviewer 'detailed'/'comprehensive' reviewType unprobed
  (LLM pass; quick legs are deterministic).
- All model-present behavior unprobed (offline shapes only).
- EliteTools repair seam (isProviderFailure) identified
  statically; no behavior change attempted.
- DeadCodeTool no-arg root is statically noted, not live-probed
  (positive leg embargoed).
- outline.relative-cwd proof identifies api/package.json by
  131-line split + session absence of package.json, not by
  content hash (read-only leg; sufficient for the rooting
  claim, not for content identity).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker on CLI-BATCH1 +
  audit slice — cross-review still pending.
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env:
  $fx='<worktree>\tmp\wiring-audit\fx-code' (auto-created)
  $env:TEMP=$fx\tmp; $env:TMP=$fx\tmp; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset)
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_code.mts
Expected: exit 0; 16/16 SELECTABLE rank-1; 36/36 legs
(6 review + 3 refactor + 4 pattern + 2 detect + 2 symbol +
4 outline + 3 analyze/codebase + 2 discovery + 1 dead +
1 request + 8 elite); run-2 verdict-identical to run-1
(Arabic/em-dash console bytes may render differently in the
redirected log — JSON verdicts are identical); fixtures removed.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied; model-backed legs take ~1-2s each offline.
