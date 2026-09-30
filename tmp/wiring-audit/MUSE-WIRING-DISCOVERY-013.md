# MUSE Wiring Discovery 013 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 13)
HEAD=4ec9fd16 + this checkpoint (probe/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for testing_qa 6/6 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root fixtures created + removed by the probe;
loopback HTTP server for the load leg) + static checker partition over
the trunk + pure-function verdict table over source-grounded shapes +
one bounded offline callLLM fragment. Full trunk probe ran 2x exit 0
with identical verdicts (19/19 legs; load hit-count varies by design).
EVIDENCE=tmp/wiring-audit/trunk_testing.mts + trunk_testing.json (run 2
machine-readable; run 1 preserved in trunk_testing.log) +
trunk_testing_run2.log + chaos_call_probe.mts + chaos_call_probe.log
(this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-012.md (LEVEL-5 files+browser_ui)

## Trunk membership (merge.json v1, challenged, stands)

testing_qa = auto_tester, chaos_test_plan, load_tester, quality_run,
sonar_analysis, test_generator (6). All 6 exist in the live registry;
no membership correction needed. Adjacent checkers code_reviewer
(code_understanding), dependency_audit + secrets_scan_repo (security),
and visual_qa (ORPHANED, no trunk) noted statically only.

## New findings (all Muse-branch @ 4ec9fd16)

### F74. chaos_test_plan reports ok:true + {} when the model is unreachable (NEW MISMATCH #11 + P2-015 extension)

Live (chaos.offline, 2/2 runs): {architecture} -> ok:true,
output {} (empty object), no error. Mechanism proven by fragment:
offline callLLM RESOLVES (MISMATCH #9 root cause) with Arabic
failure prose containing no JSON object; the tool's
`JSON.parse(response.match(... )?.[0] || '{}')`
(EliteTools.ts:129) then yields {} with ok:true.
The central ToolService apology scan (P2-015's backstop) CANNOT
catch this: the failure prose never reaches the tool output —
the regex drops it before the scan sees anything.
Consequence: the planner receives a successful empty chaos plan
for a check that never ran. Same match-or-'{}' pattern is
code-identical at 7 sibling sites (EliteTools.ts:66,99,165,199,
225,255,284: dependency_graph, business_logic_parser,
compliance_validator, cloud_cost_estimator, ambiguity_resolver,
multi_agent_debate, self_confidence_evaluator) — proven live
for 1, code-indicated for 7. Tool also has no missing-input
guard (prompt interpolates `input.architecture` unchecked,
:124-125) and is boot-permission-defaulted (declared [] ->
read, this run's boot log).

### F75. quality_run all-skipped maps to failed, not incomplete + empty per-task error (P2-004 + P2-005 extensions)

Live (quality.test.all-skipped, 2/2): no package.json in scope ->
ok:false, output.status 'incomplete',
error 'No requested quality checks were available...'.
Pure-function table: that shape maps to 'failed', NOT
'incomplete' (verification-ledger.ts:660-661: error-text
classifier; 'incomplete' is only for ok:true + unknown status).
A gate that ran but had nothing to check is therefore
indistinguishable from a gate that ran and failed — verdict is
skip-blind as well as content-blind. Separately, run 2
quality.test.fail carried per-task error:'' (EMPTY STRING) for
a real npm exit-1 — the cause exists only in the composed
top-level message, and even that varies (F76).

### F76. Nested npm-failure error text is run-varying and can be pure stdout noise (P2-005 extension, 3rd instance)

Same failing fixture, two runs: run 1 auto.unit.fail error =
npm self-update notice text ('New major version of npm
available! ...') — the exit-1 cause appears NOWHERE in the
message; run 2 same leg error = 'command_failed' (generic).
Both ok:false, both {passed,errors,summary} — verdict-stable,
diagnostic-unstable. Origin is below the tool: nested
shell_execute/handleShellCommand error surfacing substitutes
stdout noise or a generic token for the exit cause. Same
family as P2-005's two swallowed-cause instances, but this is
cause-SUBSTITUTION, not cause-absence.

### F77. Trunk checker partition 2/6; both checkers evidence-hollow; MISMATCH #10 scope covers both (static, NEW P2-019)

isVerificationTool(name,{},false,false,false): exactly
auto_tester + quality_run are task-level checkers; gate
opt-ins change nothing for this trunk; other 4 never
receipted. Neither checker emits output.url/reportPath/
evidenceLocation (quality_run: {results,status,error},
QualityTools.ts:237; auto_tester: {passed,errors,summary},
AutoTesterTool.ts:159-165,262-264) while the receipt reader
takes evidenceLocation ONLY from those keys
(PhaseExecutorTool.ts:2068) — so both checkers' receipts are
evidence-hollow by construction (3rd/4th hollow shapes after
browser_run + read_file gate). Task-level scopeRoot prefers
toolArgs.cwd/projectPath/path (PhaseExecutorTool.ts:1570-1578):
quality_run takes path, auto_tester takes projectPath — both
hit MISMATCH #10's uncontained-nonce path whenever the arg is
workspace-relative (code-indicated; live L5 proof deferred).

### F78. sideEffects declarations dishonest on 2/6 (NEW P2-020)

auto_tester declares sideEffects:[] (AutoTesterTool.ts:58)
but executes arbitrary declared npm scripts via nested
shell_execute AND can start project servers
(liveTestPort -> project_run, :382-393). test_generator
declares NO sideEffects field at all yet WRITES a test file
(AdvancedTools.ts:459, live gen.js file byte-created).
Same defect class as P2-011 (browser trunk), now proven in a
second trunk: planners trusting sideEffects mispredict both.

### F79. Trunk selectability 6/6 rank-1, zero exclusions

SELECTABLE_BY_KEYWORD 6/6, all best-rank-1 on self-name
goals; 0/6 router-excluded; 2/6 priority-listed
(quality_run, sonar_analysis); chaos_test_plan is one of the
21 boot-permission-defaulted names (declared [] -> read).
No selection-layer defect in this trunk.

### F80. test_generator ts-skip is the 7th ok:true-skipped shape (P2-004 extension)

Live (gen.ts-skip, 2/2): .ts source under node runner ->
ok:true + {generated:false, skipped:true, reason,
remediation} (AdvancedTools.ts:423-438). Honest message,
success verdict, no test written. Non-checker so no receipt;
planner-facing ok:true joins the P2-004 absence-family list
(6 prior + this). Positive leg gen.js wrote a real file
(testCount 2, coverage 100, byte-verified then cleaned).

### F81. visual_qa sits in the checker allowlist but is ORPHANED (P1-001 extension)

isVerificationTool set (verification-ledger.ts:735-739)
contains visual_qa, but the tool is implemented-not-
registered (ORPHANED, checkpoint 1). A phase gate naming it
would pass the allowlist pre-check and fail only at dispatch
— honest direction, but allowlist/registry drift. The orphan
decision (wire-vs-retire, P1-001) must include allowlist
cleanup; the P2-002 single-winner gate should cover the
checker allowlist, not just resolve names.

### F82. Contained legs green; embargoes hold

load.loopback (1 VU, 1s, loopback): ok:true, 78/98 hits,
0 errors, server closed in-probe; load.{} honest error
(the fixed empty-url guard, QualityTools.ts:441-443).
sonar.{} honest pre-shell error; positive leg stays
EMBARGOED (npx sonar-scanner, 300s timeout, network).
auto syntax matrix 5/5 honest incl. nested node --check
failure text and esbuild/JSON paths; quality pass/fail/
all-skipped 3/3 as designed. No approval gate fired
(all legs low/medium tier).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probe aborts unless 163)
TRUNK_STORIES=3/19 fully storied (testing_qa 6/6 LEVEL-4 + static
verification-compat; L5 live gate proof pending) — files 10/10 +
browser_ui 33/33 + testing_qa 6/6 = 49 tools
TRUNK_TESTING=6/6 SELECTABLE rank-1; 19/19 live legs canonical
(9 auto + 3 quality + 2 load + 3 gen + 1 sonar-negative +
1 chaos-offline), 2x verdict-identical; 11-shape verdict table
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=11 confirmed (new #11: EliteTools
match-or-'{}' converts resolved failure prose into ok:true + {};
scan backstop bypassed — F74; root-cause-linked to #9)
EXECUTABLE_NOT_VERIFIABLE=0 on 3 swept trunks (49/49 verdict-
mappable, safe direction except F74's tool-level false success
which never reaches a receipt as a checker) + 4 evidence-hollow
receipt shapes (browser_run, read_file gate, quality_run,
auto_tester) + 1 dead-reuse path (MISMATCH #10, now
code-indicated for 2 more checkers); remaining 16 trunks UNKNOWN
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P2-019 (test-run checker receipt evidence:
  quality_run/auto_tester receipts carry evidenceLocation='';
  define what evidence means for non-URL checkers or document
  hollow-by-design; MISMATCH #10 scope fix covers their reuse).
- NEW WIRING-P2-020 (testing_qa sideEffects honesty:
  auto_tester [] but runs scripts/servers; test_generator
  undeclared but writes files; same class as P2-011).
- EXTENDED WIRING-P2-015 (EliteTools match-or-'{}' variant:
  8 tools incl. chaos_test_plan; fix must ALSO fail on
  empty-extract, not only fix resolve-vs-throw — the scan
  backstop never sees the dropped prose).
- EXTENDED WIRING-P2-004 (7th ok:true-skipped shape:
  test_generator ts-skip; all-skipped->failed skip-blind
  verdict note for quality_run).
- EXTENDED WIRING-P2-005 (3rd instance: nested npm-failure
  error text run-varying stdout-noise vs generic; plus
  quality_run empty per-task error string).
- EXTENDED WIRING-P1-001 (orphan decision must include
  checker-allowlist cleanup for visual_qa).
- LIFTED nothing; no new embargoes (sonar positive stays).

## Corrections to prior checkpoints

- 012/F68 "testing_qa checkers quality_run/auto_tester/
  code_reviewer": code_reviewer belongs to code_understanding
  trunk (merge.json) — still unsurveyed; quality_run +
  auto_tester now partitioned (F77).
- 012/F69 "no storied tool emits output.status": scope was
  the 43 then-storied tools and stands; quality_run (newly
  storied) DOES emit output.status with 3 values — verdict
  table extended, mapping safe-direction except skip-blind
  (F75).

## Limits / UNKNOWNs

- 16/19 trunks still unstories; code_understanding=16
  suggested next (holds code_reviewer + 4 EliteTools
  siblings of F74), or security trunk to close the
  checker set (dependency_audit, secrets_scan_repo).
- L5 live gate proof pending for quality_run/auto_tester
  (scopeRoot-nonce extension code-indicated only).
- Model-present behavior unprobed (no provider in sandbox);
  chaos finding is strictly the no-provider path.
- sonar positive leg embargoed (network + 300s scanner).
- Adjacent-checker notes (code_reviewer, dependency_audit,
  secrets_scan_repo, project_run live opt-in, shell_execute
  test-command shapes) static-only.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker BLOCKED at last observation.
- Error-text variance (F76) observed across 2 runs only;
  deeper shell-mapping archaeology deferred to repair.

## Reproduction

From api/ with process-only test env:
  $fx='<worktree>\tmp\wiring-audit\fx-testing' (auto-created)
  $env:TEMP=$fx\tmp; $env:TMP=$fx\tmp; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset)
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_testing.mts
Expected: exit 0; 6/6 SELECTABLE rank-1; 19/19 legs
(auto 9, quality 3, load 2, gen 3, sonar 1, chaos 1);
chaos chaos.offline ok:true output {}; fixtures removed.
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\chaos_call_probe.mts
Expected: exit 0; settled resolved, hasJsonObject false,
extractedOrEmpty {}.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied; npm legs take ~3s each on warm cache.
