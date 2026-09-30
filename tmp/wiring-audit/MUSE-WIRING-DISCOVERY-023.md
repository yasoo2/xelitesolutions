# MUSE Wiring Discovery 023 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 23)
HEAD=533aa9e1 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for infra_ops 6/6 + documentation 2/2 via
canonical path (registry entry, 163 verified; ToolService.executeTool
inside firewall runInContext; session-root fixtures created + removed by
the probe; NO model legs — cloud_cost_estimator valid path + i18n_valid
path embargoed, code-cited only; NO network legs; NO destructive infra
legs — no docker rm/rmi/start/compose/build, no terraform apply/destroy,
no swarm deploy/remove, no kubectl verb beyond read-only `get`) + static
checker partition over the trunk + pure-function verdict table over
source-grounded shapes. Full trunk probe ran 2x filed runs A/B with 40/40
legs verdict-identical (ok + error-prefix + output-shape, verdictDiffs=0).
No live process survived; no stray files (session root clean, fx removed,
ci.empty session-root write restored by the probe).
EVIDENCE=tmp/wiring-audit/trunk_infradoc.mts + trunk_infradoc_run{A,B}.json +
trunk_infradoc_run{1,2}.log (this worktree; runs 1/2 = filed A/B)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-022.md (interaction LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

infra_ops = ci_generate_pipeline, cloud_cost_estimator, docker_manager,
docker_swarm_ops, kubernetes_ops, terraform_manager (6). documentation =
doc_generator, i18n_translator (2). All 8 exist in the live registry.
0/8 are task-level checkers. docker_manager's exit-blindness finding (F169)
was generalized by source survey to 4 sibling executionEngine.run()
consumers (DeadCodeTool, ErrorRecoveryTool, RepoSelfCodingTools,
VideoActionTool) — survey-only, each needs its own live check by the owner.

## New findings (all Muse-branch @ 533aa9e1)

### F169. docker_manager reports success:true when docker never ran (LIVE 2x, MISMATCH #19 NEW + P1-012 NEW)

dk.ps + dk.stop-nonexistent -> ok:true + output {success:true, stdout:'',
stderr:"...UNC paths are not supported...'docker' is not recognized..."}
BOTH runs. Mechanism (pinned, 3 layers): runCommandInternal resolves
{ok:code===0,...,exitCode} WITHOUT throwing (ExecutionEngine.ts:1033-1043);
processExecution returns success:true whenever nothing throws (:342-346),
IGNORING data.ok/exitCode; run() returns ok:result.success (:545-551),
dropping exitCode entirely. Contrast: runArgv checks
result.data?.ok !== false (:568) — the argv path is honest, the string
path is blind. docker_manager maps result.ok straight to
{ok:true, output:{success:true}} (DockerManagerTool.ts:57-62) with no
stderr/exit inspection. Verdict table: 'docker ps-shape' {ok:true,
output:{success:true}} => passed — a FALSE-ARTIFACT-direction PASS: Joe
believes infra work happened. Blast radius by source survey (owner must
live-check each): DeadCodeTool.ts:65, ErrorRecoveryTool.ts:146,
RepoSelfCodingTools.ts:90, VideoActionTool.ts:62 — all call
executionEngine.run(). Consumers that inspect stderr/output content may
still behave honestly (mechanism survey only). Repair direction (batch
P1-012): make run() honor data.ok/exitCode like runArgv does (engine-one-line
class), OR harden each consumer to inspect stderr/exit; owner decides
central-vs-local after checking the 5 consumers + shell_execute path;
add missing-binary RED (ok:false + 'not recognized' in error) for docker
+ each surveyed consumer.

### F170. Infra trio omits `error` on spawn failure — Joe sees a generic line, not the diagnosis (LIVE 2x, P2-035 NEW)

tf.plan/k8s.get/k8s.ns/sw.list -> ok:false + error 'Tool reported
failure without an error message' BOTH runs, while the REAL diagnostic
(UNC-cwd warning + 'X is not recognized') sits in output only.
Mechanism: TerraformManagerTool (:124-131), KubernetesOpsTool (:181-185),
DockerSwarmOpsTool (:237) return {ok:r.code===0, output:{...}, logs} with
NO error key on the failure leg; ToolService synthesizes the generic
error. spawnWithTimeout itself is honest-direction (reads data.exitCode,
InfrastructureTools.ts:55). Impact is debuggability, not false success:
Joe cannot distinguish binary-missing from bad-args from wrong-cwd and
cannot self-repair. Repair direction (batch P2-035): include
exitCode + stderr tail in `error` on the failure legs (tool-local, all 3
tools, one batch). Do NOT change ToolService's generic synthesis without
a broader review — it affects every tool.

### F171. doc_generator function/class counts are always {0,1} (LIVE 2x, P2-036 NEW)

dg.js (fixture: 2 real named functions + 1 real class, .md body correctly
mentions both) -> output {functions:0, classes:1} BOTH runs; dg.html +
dg.noext + dg.outside repeat {0,1}. Mechanism: functions counted by
/###\s+Function/g but headers are emitted as `### ${funcName}`
(AdvancedTools.ts:844 vs 823) — matches only a function literally named
Function*; classes counted by /##\s+Class/g which matches the always-
emitted `## Classes` header (:856 vs 824) — exactly 1 regardless of
content. The .md BODY is correct (positive); only the machine-readable
counts lie. Any consumer branching on counts misbehaves. Repair rides
P2-036 with F172 (same tool+file): count emitted headers (or the match
arrays) instead of re-regexing literal words.

### F172. doc_generator OVERWRITES extensionless sources with their own docs (LIVE 2x, P2-036)

dg.noext -> ok:true + sourceOverwritten:true + afterIsDocs:true BOTH
runs (fixture-owned file, removed by the probe). Mechanism:
sourcePath.replace(/\.\w+$/, ...) is a no-op when the filename has no
extension, so outputPath === sourcePath and writeFileSync clobbers the
input (AdvancedTools.ts:816-817). Destructive on real extensionless
files (README, LICENSE, Makefile, extensionless scripts). Repair rides
P2-036: refuse (or suffix, e.g. .md-appended) when the replace is a
no-op; regression test with an extensionless fixture asserting the
source bytes survive.

### F173. Containment inconsistency: same outside path REFUSED by terraform, WRITTEN by doc_generator (LIVE 2x, P2-037 NEW)

tf.outside -> ok:false + 'internal_exception: Error:
path_outside_workspace' (thrown OUTSIDE try, InfrastructureTools.ts:96,
raw stack surfaces) BOTH runs. dg.outside (SAME outside dir, sibling of
the session root) -> ok:true + outer.md WRITTEN outside the session root
BOTH runs. Mechanism: two resolveToolPath implementations with different
rules — InfrastructureTools-local (strict: inside session root only,
:16-31) vs shared utils.ts (allows activeRoot OR buildsDir OR projectRoot
(the WHOLE worktree) OR externalRoot, utils.ts:101-106). The worktree-
wide allowance is deliberate per code comments (Wakil 6.8), so this is a
DOCUMENTED-but-weak boundary + an inconsistency, not a single typo:
cross-session project read/write inside the worktree is permitted by the
shared util today. Repair direction (batch P2-037): reconcile the two
implementations to ONE documented rule (decide: session-scoped vs
worktree-scoped, with the Codex owner-binding + shared-default work in
view); at minimum the strict-local/weak-shared split must not survive;
add a same-path cross-tool test (one path, every file tool, one verdict).

### F174. i18n_translator is 100% dead: require('../../llm') can never resolve (LIVE 2x, P1-013 NEW)

i18n.missing/i18n.badjson/i18n.empty -> ALL ok:false + identical "Cannot
find module '../../llm'" + require stack (I18nTranslatorTool.ts via
registry.ts) BOTH runs — 3/3 legs, same error. Mechanism: the require
(I18nTranslatorTool.ts:38) targets api/src/modules/llm, which does NOT
exist (modules/ = browser, extension, integrations, sentinel, services,
terminal, tools); callLLM actually lives in api/src/core/llm.ts. The
require runs BEFORE the source-file guard, so even input validation is
unreachable: registered + selectable-by-keyword (rank 1) + ZERO
executable paths. Broken-require spelling is unique to this tool (source
survey, 1 match). Repair direction (batch P1-013): fix the require path;
add no-model tests (missing-source / invalid-json / empty — all fail
before any model call, proven by these legs); the valid path needs a
model-or-stub test; owner also dispositions two code-cited notes: (a)
absolute sourceFile passes UNCHECKED (no containment, :44) + ${lang}.json
join allows traversal-shaped lang values (:79) — no live exploit probed;
(b) non-array targetLanguages iterates per-character (for..of over a
string, :55).

### F175. ci_generate_pipeline: {} writes session-root .github + kind enum ignored (LIVE 2x, P2-038 NEW)

ci.empty -> ok:true + wrote session-root .github/workflows/node-ci.yml
(emptyCreatedSessionWorkflow:true) BOTH runs — required:['path'] is
unenforced by tool AND gateway, and '' resolves to the active root
(QualityTools.ts:370 via shared resolveToolPath). The probe restored the
session root (file removed iff the leg created it; cleanup=ok both runs).
ci.kind-python -> ok:true + node-ci.yml written anyway BOTH runs: `kind`
(enum ['node']) is never read by execute() — schema-only. Same
input-guard family as F164/F161 (unenforced required/enum), but with a
real write effect (stray CI file in whatever the active root is).
Repair direction (batch P2-038): reject empty path with a sentence;
either enforce kind or drop it from the schema; regression asserts no
write on {} + kind-behavior pinned.

### F176. P1-010 generalization: UNC-cwd failure hits ALL FOUR spawn families (LIVE 2x, supporting evidence, no new batch)

tf.plan/k8s.get/k8s.ns/sw.list (ExecutionGateway shell path) + dk.ps/
dk.stop (executionEngine.run path) ALL carry the P1-010 UNC-cwd stderr
("'\\\\?\\...' CMD.EXE was started... UNC paths are not supported.
Defaulting to Windows directory") BOTH runs. P1-010's blast radius
therefore includes the engine/gateway shell path, not just
shell_execute — one fix at the spawn boundary (extended-prefix
normalization) repairs all of them. Bonus binary census from the same
stderr: terraform/kubectl/docker are ALL absent on this box ('X is not
recognized') — so the EXPECTED post-P1-010 behavior for every spawn leg
here is honest-unavailable, and F169's false-success is NOT an artifact
of the UNC cwd (a present binary would still report success:true on
failure through the same blind mapping).

### F177. Positives: guards honest, passthrough proven, roundtrips byte-verified (LIVE 2x)

tf.empty/tf.bad, k8s.empty, sw.empty/sw.deploy-missing, cc.empty/cc.nores
(all schema/input guards) -> honest ok:false with specific sentences BOTH
runs. k8s.ns log 'executed: kubectl -n audit-ns get pods' proves -n
passthrough. ci.create wrote byte-verified 'name: Node.js CI' content +
ci.rerun returned skipped:true (idempotent roundtrip). doc .md BODY is
correct (mentions alpha + Gamma fixture symbols). cost guards fail BEFORE
any model call. No approval-gate pre-emption on any leg; `[ToolService]
Auto-assigned workspace context: session-audit-sess` fired (context
propagation visible).

### F178. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 8/8, ALL rank-1 on self-name. 0/8 ROUTER_EXCLUDED.
kubernetes_ops is PRIORITY-listed (the kubectl passthrough is a priority
tool — note for least-privilege review, no claim). cloud_cost_estimator
is in the 21 boot permission-defaulted tools ([] -> read; boot list
UNCHANGED at 21; same systemic family as summary finding #4).
Rate limits: default 60 except cost 20, docker_manager 15, i18n 5.
Verdict-table notes: 'ci created/skipped' + 'doc counts' => passed
(ledger's generic ok+output rule — observation; 'doc counts' passes on
WRONG counts, consumer-side note, no batch beyond P2-036); all six guard
shapes => failed (correct). Note (no batch): dg.missing error leaks the
absolute \\?\ server path — same absolute-path-in-error shape as
tf.outside's stack; a future error-hygiene sweep should cover it.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probes abort unless 163)
TRUNK_STORIES=13/19 fully storied (infra_ops 6/6 + documentation 2/2
LEVEL-4 + static verification-compat + checker-set 0/8) — 120 + 8 = 128 tools
TRUNK_INFRADOC=8/8 SELECTABLE (all rank-1); 40/40 live legs canonical 2x
filed verdict-identical (verdictDiffs=0); 12-shape verdict table;
fixtures removed (session root clean, fx-infradoc removed, ci.empty
session write restored)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=19 confirmed (NEW #19: ExecutionEngine.run exit-
blindness -> docker_manager success:true on missing binary, verdict
passed F169)
EXECUTABLE_NOT_VERIFIABLE=0 on 13 swept trunks (128/128 verdict-
mappable; false-success joins as MAPPING-false-pass (#19))
CHECKER_SET=14 task-level + project_run live-gate-only (unchanged;
0/8 trunk task-level checkers)
P1_ITEMS=2 new (P1-012 engine exit-blindness F169, P1-013 i18n dead
require F174)
P2_ITEMS=4 new (P2-035 infra error-swallow F170, P2-036 doc counts+
overwrite F171+F172, P2-037 containment split F173, P2-038 ci input
contract F175)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-012 (engine exit-blindness F169): make run() honor
  data.ok/exitCode like runArgv, or harden the 5 run() consumers;
  owner surveys DeadCode/ErrorRecovery/RepoSelfCoding/VideoAction live
  + shell_execute path; missing-binary RED per consumer. Central-vs-
  local decision is the owner's with reviewer sign-off.
- NEW WIRING-P1-013 (i18n dead require F174): fix require path to
  core/llm; no-model regression tests (missing/invalid/empty fail
  pre-model); model-or-stub valid-path test; disposition the traversal
  + per-character notes without live-exploiting them.
- NEW WIRING-P2-035 (infra error-swallow F170): exitCode + stderr tail
  in `error` on failure legs, all 3 tools, one batch; ToolService
  synthesis untouched.
- NEW WIRING-P2-036 (doc counts + overwrite F171+F172): count emitted
  headers/matches; refuse-or-suffix on extensionless input; assert
  source bytes survive.
- NEW WIRING-P2-037 (containment split F173): ONE documented rule for
  both resolveToolPath implementations; same-path cross-tool test.
- NEW WIRING-P2-038 (ci input contract F175): reject empty path; pin
  kind behavior; assert no write on {}.
- LIFTED nothing; embargoes hold (model legs on cost-valid + i18n-valid
  paths; network legs; destructive infra legs; live injection payloads).
- SUPPORTING (no batch): F176 extends P1-010 evidence to the engine/
  gateway shell path; F178 kubernetes priority-listing is least-
  privilege review input.

## Working hypotheses (formed at source-read, before first run)

- 'all eight are selectable by self-name' — CONFIRMED (all rank-1) (F178).
- 'terraform guards action+directory' — CONFIRMED (F177).
- 'terraform plan fails honestly without the binary' — CONFIRMED in
  direction (ok:false) but the error channel is generic (F170); the cwd
  is ALSO wrong per P1-010 (F176).
- 'terraform refuses outside paths' — CONFIRMED (strict-local) (F173).
- 'kubectl guards empty + passes namespace' — CONFIRMED (F177).
- 'swarm guards action/compose' — CONFIRMED (F177).
- 'docker ps fails honestly without the daemon' — REFUTED: ok:true
  success:true on missing binary (F169).
- 'docker {} is rejected' — CONFIRMED: 'Unknown action' (F177).
- 'cost estimator guards empty resources' — CONFIRMED (F177).
- 'cost valid path needs a model' — EMBARGOED, code-cited (F176-note).
- 'ci create+skip roundtrips' — CONFIRMED, byte-verified (F177).
- 'ci {} is rejected' — REFUTED: writes session-root .github (F175).
- 'ci kind is honored' — REFUTED: ignored, node CI always (F175).
- 'doc counts match content' — REFUTED: always {0,1} (F171).
- 'doc refuses missing/empty' — CONFIRMED (F177).
- 'doc refuses outside paths' — REFUTED: writes outside (F173).
- 'i18n refuses missing/invalid/empty pre-model' — REFUTED in mechanism:
  all three fail on the dead require before any validation (F174).

## Limits / UNKNOWNs

- 6/19 trunks still unstories (network_api=12, language_runtimes=4,
  media_images=2, memory_knowledge=7, planning_orchestration=10... see
  note). memory_knowledge overlaps NVIDIA-claimed files and
  planning_orchestration is NVIDIA-owned — do not story without
  coordination. Suggested next: language_runtimes=4 (execution embargo
  care) or network_api=12 (network embargo care); media_images=2 needs
  image_studio boundary care (open security scope — coordinate before
  live project-entry legs).
- F169 sibling consumers (DeadCode/ErrorRecovery/RepoSelfCoding/
  VideoAction) surveyed by source only — each needs a live check.
- F173 worktree-wide allowance may be intentional (Wakil 6.8) — the
  audit proves the SPLIT + the cross-session effect, not the intent.
- i18n valid path (model) never executed — code-cited only.
- cost valid path (model) never executed — code-cited only.
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
  $fx='<worktree>\tmp\wiring-audit\fx-infradoc' (auto-created+removed)
  $env:TEMP=Join-Path $fx 'tmp'; $env:TMP=Join-Path $fx 'tmp'
  $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true'
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=Join-Path $fx 'store'
  $env:ARTIFACT_DIR=Join-Path $fx 'artifacts'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN unset)
  node D:\Joe\muse-worktree\api\node_modules\tsx\dist\cli.mjs D:\Joe\muse-worktree\tmp\wiring-audit\trunk_infradoc.mts
Expected: 8/8 SELECTABLE rank-1; 40 legs, 12 ok; dk.ps/dk.stop ok:true
success:true with 'not recognized' stderr; tf/k8s/sw spawn legs ok:false
with generic error + diagnostic output; dg counts {0,1}; dg.noext
sourceOverwritten:true; dg.outside ok:true (outer.md written);
tf.outside path_outside_workspace; i18n 3/3 'Cannot find module';
ci.empty session write + restored; cleanup=ok; node process exits 0.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied (hence the fx tmp redirect); full trunk run ~1-2 min.
