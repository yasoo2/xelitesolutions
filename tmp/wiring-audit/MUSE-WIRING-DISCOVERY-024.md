# MUSE Wiring Discovery 024 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 24)
HEAD=1b19c6a4 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for language_runtimes 4/4 via
canonical path (registry entry, 163 verified; ToolService.executeTool
inside firewall runInContext; session-root fixtures created + removed by
the probe; execution embargo care: ONE print leg + syntax/bad-cwd legs
for execute_python, all of which failed honestly on missing python3; NO
go/java toolchain invocations — build legs are canned by source design,
which IS the finding; NO traversal projectName live legs — code-cited
only; NO timeout-cap live leg — code-cited only; NO network legs; NO
live injection payloads) + static checker partition over the trunk +
pure-function verdict table over source-grounded shapes. Full trunk probe
ran 2x filed runs A/B with 32/32 legs verdict-identical (ok +
error-prefix + output-shape, verdictDiffs=0; decl + verdict table also
byte-stable). No live process survived; no stray files (session root
clean, FX removed, both scaffold nonce dirs removed by the probe).
EVIDENCE=tmp/wiring-audit/trunk_lang.mts + trunk_lang_run{A,B}.json +
trunk_lang_run{1,2}.log + compare_lang_runs.py + rank_lang_selfname.mts
(this worktree; runs 1/2 = filed A/B)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-023.md (infra_ops+documentation LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands with effect note)

language_runtimes = execute_python, go_builder, java_builder,
python_builder (4). All 4 exist in the live registry. 0/4 are
task-level checkers. EFFECT ASYMMETRY (proven live, not a membership
challenge): go/java_builder WRITE scaffold trees to disk (outside the
session root, F179) while python_builder is a PURE generator that never
touches its required projectPath (F181) — same trunk, opposite disk
effects. Purpose-merge stands; the matrix rows carry the asymmetry.

## New findings (all Muse-branch @ 1b19c6a4)

### F179. go/java scaffold writes process.cwd()+projectName: outside the session root, unsanitized (LIVE 2x, P1-014 NEW)

go.scaffold/jv.scaffold -> ok:true + filesCreated 6/6 + byte-verified
content (go.mod module line, plain net/http main, pom web dep,
HelloController) BOTH runs. projectPath = path.join(process.cwd(),
projectName) (GoBuilderTool.ts:97, JavaBuilderTool.ts:107) — in-probe
that was the WORKTREE ROOT (apiCwd=`\\?\D:\Joe\muse-worktree`), session
root untouched (wroteSessionRoot:false both). The probe removed ONLY its
nonce dirs (removed:true both; Test-Path False x3 after). Mechanism:
direct fs.mkdirSync(recursive)+fs.writeFileSync with NO resolveToolPath
call and NO projectName sanitization — a traversal-shaped projectName
reaches recursive mkdir + file write by construction (CODE-CITED ONLY,
no live traversal leg per embargo). In production the API cwd is api/,
so every scaffold lands in api/<name> — polluting the server tree,
invisible to session-scoped verification, and writable across sessions.
Repair direction (batch P1-014): anchor scaffold under the session
workspace root via the shared path util (after the P2-037
reconciliation decides the ONE rule); reject traversal/absolute
projectName with a sentence; regression asserts scaffold lands inside
the session root + traversal refused + no api/ strays.

### F180. go/java build/test/dependencies return canned success:true without doing anything (LIVE 2x, P2-039 NEW)

go.build/go.test/go.deps + jv.build-gradle/jv.test/jv.deps -> ok:true
+ output.success:true BOTH runs. Mechanism: buildProject/setupTests/
manageDependencies never spawn go/mvn/gradle and never touch the
filesystem (GoBuilderTool.ts:481-524, JavaBuilderTool.ts:393-437).
The messages are honest-ISH ('Use X to build', 'Test configuration
ready') but success:true + verdict passed tells Joe the work HAPPENED.
gradle/maven switch works (buildGradleCmd='gradle build'); deps input
is echoed, never installed. Contrast: scaffold at least performs its
effect. Repair direction (batch P2-039): either perform the effect
(spawn the toolchain with the P1-010 spawn-boundary fix in view) or
return an explicit plan/instruction shape WITHOUT success:true
(e.g. {planned:true} + verdict failed/unsupported) so Joe does not
record a build that never ran; regression pins no-spawn + shape.

### F181. python_builder never touches its required projectPath: pure generator in write clothing (LIVE 2x, P2-040)

pb.flask -> ok:true + 4 files BOTH runs with wroteProjectPath:false —
the directory was never created. Mechanism: execute() only calls
generateStructure() and returns file CONTENTS in output; projectPath
is read solely for the 'cd <path>' nextSteps hint
(PythonBuilderTool.ts:63-79). Yet the tool declares permissions+side-
Effects ['write'] and required:['framework','projectName',
'projectPath'] — a pure function triple-gated as a writer (medium risk
tier for zero disk effect; the reverse of F179's under-contained
writers). requirements.txt IS feature-additive (db->Flask-SQLAlchemy,
auth->Flask-Login, both proven). Repair rides P2-040 with F182+F183
(same tool): either actually materialize the tree under the session
root (then F179's rule applies) or drop the write declarations +
required projectPath and document generator semantics.

### F182. python_builder silently accepts unknown frameworks (LIVE 2x, P2-040)

pb.badframework {framework:'rails'} -> ok:true + 3 common files BOTH
runs; requirements.txt = 'pytest' only, NO framework files, NO error.
Mechanism: the inputSchema enum ['django','flask','fastapi','basic']
is unenforced (tool + gateway), and generateStructure's switch has NO
default-reject (PythonBuilderTool.ts:111-130) — unknown values fall
through to common-files-only. Same input-guard family as F175 (ci kind
ignored) and F164, but SILENT here: Joe asked for rails, got 3 generic
files + success:true. Repair rides P2-040: reject unknown framework
with the enum sentence; regression asserts ok:false + no partial tree.

### F183. python_builder {} surfaces a raw TypeError (LIVE 2x, P2-040)

pb.empty -> ok:false + "Cannot read properties of undefined (reading
'toUpperCase')" BOTH runs. Mechanism: README template calls
framework.toUpperCase() on undefined (PythonBuilderTool.ts:107),
caught by the generic catch (:81-88). Honest DIRECTION (ok:false),
raw-TYPE mechanism — same error-hygiene family as F155/F161. Repair
rides P2-040: validate required inputs with sentences before
generation; regression asserts sentence-error, no 'Cannot read'.

### F184. POSITIVE: execute_python fails honestly without the interpreter (LIVE 2x, no batch)

py.print/py.syntax/py.badcwd -> ALL ok:false + 'spawn python3 ENOENT'
+ exitCode 1 + stdout '' BOTH runs (python3 absent on this Windows
box). The error is SPECIFIC and present in BOTH the error key and
stderr — no MISMATCH-#5 substitution, no F169-style false success.
ok = !!result.data?.ok (PythonExecutionTool.ts:94) honors the
gateway's honest spawn failure. The exitCode contract on REAL script
failure (syntax leg intent) is UNPROVEN live — every spawn leg died
at ENOENT before Python ran — and stays code-cited
(:79 exitCode passthrough). The bad-cwd leg is AMBIGUOUS for the same
reason: spawn-with-missing-binary and spawn-with-bad-cwd both yield
ENOENT-class failure, so workingDirectory containment is UNPROVEN
live (no resolveToolPath call in source — code-cited gap, F185).

### F185. execute_python containment notes: system-temp staging + 'isolated' overclaim + uncontained cwd (LIVE + code, P2-041 NEW)

(a) Code is staged to os.tmpdir() (PythonExecutionTool.ts:66-67) —
OUTSIDE the session root (in-probe TEMP was fx-redirected; in
production it is the system temp). The tool unlinks after itself on
both paths (:82, :103), but a kill between write and unlink leaves
arbitrary Joe-authored code in shared temp. (b) The description
claims an 'isolated environment' (:12) — FALSE by construction:
cwd = input.workingDirectory || process.cwd() (:56), no sandboxing,
full stdlib incl. os. (c) workingDirectory is passed to the gateway
uncontained (no resolveToolPath; live UNPROVEN per F184). Repair
direction (batch P2-041): stage under the session/fx temp instead of
os.tmpdir; contain workingDirectory to the session root; correct the
description to 'runs with the session cwd, no sandbox'; keep the
honest missing-interpreter shape as the regression anchor; timeout
cap (min(input,120)s, :55) stays code-cited (no 120s live leg).

### F186. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 4/4. execute_python/java_builder/python_builder
rank-1 on BOTH goals. go_builder rank-1 on the description goal but
rank-7 (score 3) on the self-name goal ('go' too short, 'builder' in
neither tags nor description) — selectable, weakly self-grounded.
execute_python is PRIORITY-listed: arbitrary code execution on the
priority surface — least-privilege review note (same class as F178's
kubernetes note, no claim). All 3 builders ROUTER_EXCLUDED-but-
keyword-carried (fast-path-only exclusion, consistent with the
INTERNAL_ONLY note — not proof of internal-by-design). Rate limits:
py 20, builders 10 each. Boot permission-default list UNCHANGED at
21. 0/4 checkers of any level (checker set stays 14 task-level +
project_run live-gate-only).

### F187. Verdict table + consumer notes (no new mismatch number)

9 shapes: all 4 guard shapes => failed (correct, incl. pb.empty's
TypeError shape); print-ok/scaffold-ok/build-canned/files shapes =>
passed. The canned build/test successes (F180) pass WITHOUT effect —
a CONSUMER-side note riding P2-039, NOT a new CONTRACT_MISMATCH
number: the lie is the tool's own success:true (tool-local honesty,
same class as F113/F175), not a cross-boundary mapping defect.
py.syntax-fail => failed is the DESIRED shape, unproven live (F184).

### F188. Positives: guards, bytes, additivity, hygiene (LIVE 2x)

py.empty/py.blank pre-exec guards; go/jv 'Unknown action' incl.
'undefined'; scaffold bytes exact (module path, plain-vs-gin main,
pom deps, controller path); flask/db/auth requirements additive;
nextSteps cd hint echoes projectPath; no approval-gate pre-emption on
any leg; '[ToolService] Auto-assigned workspace context:
session-audit-sess' fired (context propagation visible); cleanup=ok
both runs; nonce dirs removed by the probe (filesystem re-verified).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probes abort unless 163)
TRUNK_STORIES=14/19 fully storied (language_runtimes 4/4 LEVEL-4 +
static verification-compat + checker-set 0/4) — 128 + 4 = 132 tools
TRUNK_LANG=4/4 SELECTABLE (3 rank-1 both goals, go rank-7 self-name);
32/32 live legs canonical 2x filed verdict-identical (verdictDiffs=0;
decl + verdict table byte-stable); 9-shape verdict table; fixtures
removed (session root clean, FX removed, 2 nonce scaffold dirs
removed by the probe, filesystem re-verified)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=19 confirmed (no new number: F179-F183/F185 are
tool-local honesty/containment, same class as F113/F175/F155)
EXECUTABLE_NOT_VERIFIABLE=0 on 14 swept trunks (132/132 verdict-
mappable; canned-success joins as consumer note under P2-039)
CHECKER_SET=14 task-level + project_run live-gate-only (unchanged;
0/4 trunk task-level checkers)
P1_ITEMS=1 new (P1-014 cwd-anchored unsanitized scaffold F179)
P2_ITEMS=3 new (P2-039 canned build/test/deps F180, P2-040 python_
builder contract F181+F182+F183, P2-041 execute_python hardening F185)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-014 (cwd scaffold F179): anchor go/java scaffold under
  the session root via the shared path util after P2-037 decides the
  ONE rule; reject traversal/absolute projectName; regression asserts
  session-root landing + refusal + no api/ strays.
- NEW WIRING-P2-039 (canned success F180): perform the toolchain effect
  or return a plan-shape WITHOUT success:true; regression pins shape.
- NEW WIRING-P2-040 (python_builder contract F181+F182+F183):
  materialize-or-declare-generator for projectPath/write; reject
  unknown framework with the enum sentence; sentence-validate required
  inputs (no raw TypeError).
- NEW WIRING-P2-041 (execute_python hardening F185): session-temp
  staging; contained workingDirectory; honest description; keep the
  ENOENT shape as the regression anchor.
- LIFTED nothing; embargoes hold (traversal live legs, 120s timeout
  leg, model legs, network legs, toolchain invocations beyond the
  canned-leg proof, live injection payloads).
- SUPPORTING (no batch): F184 honest-ENOENT is the control that proves
  F169-class false success is NOT universal; F186 go rank-7 +
  execute_python priority-listing are selector/least-privilege notes.

## Working hypotheses (formed at source-read, before first run)

- 'all four selectable by self-name' — CONFIRMED (go rank-7, rest
  rank-1) (F186).
- 'py {} + blank guarded pre-exec' — CONFIRMED (F188).
- 'py print executes or fails honestly' — CONFIRMED honest-fail
  (spawn ENOENT) (F184).
- 'py syntax leg proves the exit contract' — UNPROVEN live (binary
  missing; code-cited) (F184).
- 'py bad cwd surfaces a gateway error' — UNPROVEN live (ENOENT
  ambiguity; code-cited gap) (F184/F185).
- 'go/java {} + bad action -> Unknown action' — CONFIRMED (F188).
- 'go/java scaffold writes cwd, not session root' — CONFIRMED
  (worktree root in-probe, removed) (F179).
- 'go/java build/test/deps are canned' — CONFIRMED (F180).
- 'pb {} rejected' — CONFIRMED in direction, raw TypeError in
  mechanism (F183).
- 'pb never writes projectPath' — CONFIRMED (F181).
- 'pb features additive' — CONFIRMED (db+auth) (F188).
- 'pb rejects unknown framework' — REFUTED: rails ok:true, 3 files
  (F182).
- '0/4 checkers' — CONFIRMED (F186).

## Limits / UNKNOWNs

- 5/19 trunks still unstories (network_api=12, media_images=2...
  see note). memory_knowledge overlaps NVIDIA-claimed files and
  planning_orchestration is NVIDIA-owned — do not story without
  coordination. Suggested next: network_api=12 (network embargo
  care); media_images=2 needs image_studio boundary care (open
  security scope — coordinate before live project-entry legs).
- F179 traversal reach is code-certain but never live-probed
  (embargo); owner live-checks with a fixture-owned outside dir.
- F184/F185 python-present behavior (exit codes, cwd effects,
  timeout cap) unproven — needs a box with python3 or a stubbed
  gateway leg by the owner.
- F180 toolchain-present behavior unknown — the tools never spawn
  toolchains, so 'present' changes nothing until P2-039 lands.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (probes perform zero source edits;
  CLI-BATCH1 review duty retained, no committed NVIDIA diff exists
  yet to review — main still e8fd9589, CLI work dirty/uncommitted).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env (note: the sandbox CWD arrives as
`\\?`-prefixed, which node cannot resolve relatively — reset the
process directory and invoke node with ABSOLUTE paths):
  [System.IO.Directory]::SetCurrentDirectory('D:\Joe\muse-worktree\api')
  $fx='<worktree>\tmp\wiring-audit\fx-lang' (auto-created+removed)
  $env:TEMP=Join-Path $fx 'tmp'; $env:TMP=Join-Path $fx 'tmp'
  $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true'
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=Join-Path $fx 'store'
  $env:ARTIFACT_DIR=Join-Path $fx 'artifacts'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN unset)
  node D:\Joe\muse-worktree\api\node_modules\tsx\dist\cli.mjs D:\Joe\muse-worktree\tmp\wiring-audit\trunk_lang.mts
Expected: 4/4 SELECTABLE (go rank-7 self-name, all rank-1 on second
goal); 32 legs, 16 ok; py 5/5 ok:false (guards + 3x ENOENT);
go/jv empty+bad unknown-action, scaffolds ok:true to process cwd +
removed, build/test/deps canned ok:true; pb.empty TypeError ok:false,
pb 4-framework ok:true with wroteProjectPath:false, rails ok:true
3 files; cleanup=ok; node process exits 0.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied (hence the fx tmp redirect); full trunk run ~1-2 min.
Compare filed runs: python tmp/wiring-audit/compare_lang_runs.py
(exit 0, verdictDiffs=0). Self-name ranks:
node .../tsx/dist/cli.mjs tmp/wiring-audit/rank_lang_selfname.mts
(with the same fx tmp redirect).
