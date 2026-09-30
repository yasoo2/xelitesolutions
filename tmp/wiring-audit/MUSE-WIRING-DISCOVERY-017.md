# MUSE Wiring Discovery 017 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 17)
HEAD=09ee15dc + this checkpoint (probe/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for build_generate 13/13 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root + OS-temp + builds-dir + repo-root fixtures
created + removed by the probe; NO network legs; model-backed legs run
bounded under OFFLINE_MODE to record the no-provider shape only) + static
checker partition over the trunk + pure-function verdict table over
source-grounded shapes. Full trunk probe ran 2x exit 0 with identical
verdicts (45/45 legs ok/error/shape). A focused follow-up probe for
progressive_generator batch-3 ran 2x exit 0 with byte-identical
finding content. Scrub note: the pilot run's artifacts contained one
fixture Bearer token shape the first scrubber missed (Bearer <tok>
has no key separator); the scrubber was fixed, pilot artifacts were
deleted (never committed), and final artifacts were re-verified with
a file-based checker (Bearer 2/2 + shown-once 2/2 redacted per JSON).
EVIDENCE=tmp/wiring-audit/trunk_build.mts + trunk_build.json (run B
machine-readable; run A preserved in trunk_build_runA.json) +
trunk_build.log (run A) + trunk_build_run2.log (run B) +
prog_batch3.mts + prog_batch3_run{1,2}.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-016.md (vcs_repo LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

build_generate = ai_write_file, api_project, auth_builder,
enterprise_platform_foundation, mobile_builder,
orion_business_foundation, progressive_generator, react_project,
scaffold_full_stack, scaffold_project, template_manager,
web_page_builder, website_full_pipeline (13). All 13 exist in the
live registry; no membership correction needed. 0/13 are task-level
checkers (gate opt-ins change nothing) — the 14/14 checker set stays
CLOSED with no new member.

## New findings (all Muse-branch @ 09ee15dc)

### F111. scaffold_project traversal-key escapes the base, contained only to the workspace, receipt lies (LIVE 2x)

scaf.traversal-key (baseDir wiring-build-fx/scaf2, structure key
'../../wiring-build-evil17.txt') -> ok:true, created:[BOTH keys],
errors:[], projectDir=.../scaf2 — while the evil file landed in the
SESSION ROOT (evil.session:true both runs; removed as a stray).
The per-key safePath check (SystemTools.ts:1436) enforces only the
4-root rule (workspace/projectRoot/builds/external,
tools/utils.ts:101-104), NOT base containment — despite the
comment at SystemTools.ts:1433-1436 describing base escape as the
threat. The receipt compounds it: created[] echoes the raw
'../../' key and projectDir names the base the file escaped.
P2-006 extension (base-escape) + P2-004 extension (receipt/base
mismatch).

### F112. scaffold_project baseDir '../../..' writes a.js to the REPO ROOT (P1-007 NEW, LIVE 2x)

scaf.base-traversal -> ok:true, created:['a.js'],
projectDir=D:\Joe\muse-worktree: the file was created at the
repository root (repoRootAjs:true, content '1' verified, then
probe-removed; ajsRemoved:true both runs). Same 4-root rule:
projectRoot is an explicitly allowed root (utils.ts:103), so a
planner-controlled baseDir reaches the Joe checkout itself.
Repair direction (batch): session-bind scaffold baseDir (reject
or re-anchor above-workspace bases); re-audit the 4-root rule
for planner-reachable writers. NOT implemented here
(audit-first; needs implementation owner + security review).

### F113. auth_builder out-of-enum 'saml' -> ok:true degraded 2-file stub (LIVE 2x, P2-004 14th)

auth.bogus-type (type 'saml') -> ok:true + "Auth system
generated!" with 2 files (config.ts, index.ts) vs jwt's 3
(+jwt.ts): NO type branch matched (AuthBuilderTool.ts:91/103/
117), yet the tool reports a generated auth system. The schema
enum (jwt/oauth/session/full) is decorative — execute() never
validates it. A planner trying an unsupported type gets a
non-functional stub with a success receipt.

### F114. auth_builder root split: builds-dir relatives, honored in-project absolutes, refused true-outsiders (LIVE 2x)

- Relative outputDirs land in data/builds/workspace-default/
  (session-agnostic): resolveToolPath sandbox:true FORCES the
  root there whenever it is outside builds (utils.ts:65-77).
- Absolute paths INSIDE the project root are honored raw
  (auth.outside wrote 4 files into the OUTSIDE fixture).
- Absolute paths OUTSIDE the project root are refused
  honestly (auth.true-outside, system-temp target ->
  'outside the workspace', nothing written; trueOutRefused).
The throw path and the 4-root allow rule are both proven
end-to-end. P2-006 extension (session-agnostic builds root +
absolute-inside acceptance).

### F115. scaffold_full_stack: no context, silent defaults, overwrite:true (LIVE 2x)

execute(input) takes NO context param (6th no-context
instance, WebDevelopmentTools.ts:652): full.contained wrote
the saas scaffold to the fixture; full.name-default ({baseDir}
only) silently built 'my-app' (P2-004 15th: required name
defaults); full.bogus-type ('cobol') produced output
identical modulo path (schema enum decorative, no
validation). Builder.scaffold DELETES colliding targets by
default (overwrite !== false -> rm -rf, Builder.ts:30-32)
and defaults baseDir to repo data/projects (Builder.ts:16-20,
code-cited — the probe always passed baseDir). P2-004 +
P2-006 extensions.

### F116. progressive_generator batch-3 writes provider-failure prose AS Component1.tsx with ok:true (LIVE 2x, MISMATCH #9 5th instance)

Focused probe (prog_batch3.mts): batch_components_001 (5
PROMPT:-bearing files) -> ok:true, 12/14 files, both runs;
Component1.tsx head is byte-identical Arabic no-provider
prose (starts with the intelligence-engine failure notice).
Mechanism: callLLM -> routeToModel RESOLVES failure prose
instead of throwing (MISMATCH #9), so the try/catch at
ProgressiveGeneratorTool.ts:566 never fires and the prose is
fence-stripped and WRITTEN AS SOURCE. The 5th #9 instance
and the most severe direction yet: a persistent false
artifact (prior instances stayed in tool output). The
placeholder branch (ERROR GENERATING CODE) is dead on this
path; batches 1-2 are static and green.

### F117. api_project input.root honored raw: outside-session scaffold (LIVE 2x)

api.root-outside (root=OUTSIDE fixture, skipInstall) ->
ok:true + full 7-file scaffold under the fixture
(api.outside lists api-fxapiout17 both runs). No
resolve/contain on input.root (ApiProjectTool.ts:2723:
`input?.root || getActiveRoot(...)`): a planner-controlled
field selects an arbitrary write root. P2-006 extension.
React twin code-cited (ReactProjectTool.ts:4651/5037, same
pattern — live-unprobed to bound cost).

### F118. api/react skipInstall positives carry honest unproven flags (LIVE 2x, positive controls)

api.skip-positive -> ok:true with proven:false,
installed:false, authProven:false; react.skip-positive ->
ok:true with acceptance.accepted:false + "could not derive
a checkable criterion" note. The skip path does not claim
proof it skipped — the honest counterpart to F116/F113.
Both are non-checkers, so the ok:true verdict shapes are
safe-direction F88-class constraints for any allowlist
change. (Fixture credentials in api output were
probe-scrubbed; see METHOD.)

### F119. ai_write_file: traversal path reaches the model; containment only at write (LIVE 2x + static)

ai.traversal ('../../wiring-build-evil17.txt' + description)
-> no-provider MODEL error, not a path error: the traversal
passed normalization and spent a model call.
normalizeRuntimeArtifactPath returns its input unchanged
without projectRoot context (AIGeneratorTool.ts:84: "...
rejected downstream"). Validation ordering defect: model
before containment. P2-006 extension (ordering).
Positive controls: ai.empty/ai.path-only return the honest
no-model-called error without touching the model.

### F120. web_page_builder input.filename is DEAD (STATIC, MISMATCH #4 4th instance)

No `input.filename` read exists anywhere in
WebPageBuilderTool.ts (all .filename refs are prev/session
memory); the output name is always joe-<sessionKey>.html
(:1546-1550). The schema promises an input the tool
ignores: a planner selecting per-schema cannot control the
artifact name. Repair rides P2-002 (implement or drop).
Live legs prove the failure direction is honest:
page.empty -> no_request; page.offline-positive ->
no-provider error with ZERO artifact writes (artifacts
MISSING both runs) — fail-closed, not hollow.

### F121. Ambient workspace mechanism documented; F107 CORRECTED to UNPROVEN

Why every no-arg root landed in the SESSION root this
checkpoint: ToolService resolves sessionId->workspaceId via
resolveSessionIdentity (ToolService.ts:744-762:
'audit-sess' -> session-audit-sess), wraps execution in
runWithWorkspace (:863-865), and no-arg getActiveRoot()
inside the tool reads the ambient store
(WorkspaceService.ts:216-220). Same mechanism explains all
prior trunk session landings.
CORRECTION to 016/F107 ("git default-cwd runs in the
default workspace, NOT the session"): UNPROVEN, not
disproven. Session and default roots are BOTH exactly 3
below the repo root, so ../../../-prefixed git status
output cannot distinguish them, and the stored leg
preview is truncated before any unprefixed below-cwd
entry. The ambient mechanism predicts session root.
Decisive test (seeded session marker + unprefixed-entry
check) is outstanding as a vcs-trunk follow-up — not
executed here for trunk discipline.

### F122. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 13/13; 12/13 best-rank-1 on
self-name goals (website_full_pipeline rank-2 is the only
divergence). 10/13 are ROUTER_EXCLUDED yet catalog rank
high — the flag/catalog split again (exclusion is
ACT-verb fast-path/rerank-pool only, not selectToolsFor;
router-side proof still outstanding). 3/13
priority-listed (scaffold_full_stack, scaffold_project,
website_full_pipeline). 0/13 checkers.
Registry/source skews noted, not live defects:
template_manager + web_page_builder declare permissions []
but register ['write'] (registry defaulting — members of
the known 21-perm-defaulted group); web_page_builder
rateLimit 0 registers 30 (known 2-ratelimit-defaulted
group); web_page_builder sideEffects [] despite file +
preview writes (empty-sideEffects skew beyond browser
P2-011 — extension noted).

### F123. Positive controls + hygiene (LIVE 2x)

template_manager 4/4 honest (list/react-app
byte-rendered/bogus/empty); mobile build/run return
command STRINGS only (no exec — the execute permission
overstates, safely); ent/ori contained positives (34/21
files, python verified:true acceptanceRan:true both
runs); prog negatives honest; pipe.empty honest.
Embargoes held: pipeline named legs (nested execution +
npm + setActiveRoot mutation — the setActiveRoot call at
WebDevelopmentTools.ts:193 is flagged for a future
safety probe, not executed); mobile default-cwd
(code-cited, MobileBuilderTool.ts:93); full-stack {}
(code-cited my-app + data/projects default);
react/api full legs (npm + boot); ent/ori default-root
landing (code-cited getExplorerRoot); all model-present
behavior. Hygiene: fixtures + strays removed both runs
(session api/react/evil, repo-root a.js, builds
wiring-build-fx, OUTSIDE/TRUE_OUT fixtures); real
api/data/db store untouched (grep clean); session root
left empty.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probe aborts unless 163)
TRUNK_STORIES=7/19 fully storied (build_generate 13/13 LEVEL-4 + static
verification-compat; no new checker) — files 10/10 + browser_ui
33/33 + testing_qa 6/6 + security 3/3 + code_understanding 16/16 +
vcs_repo 11/11 + build_generate 13/13 = 92 tools
TRUNK_BUILD=13/13 SELECTABLE (12 rank-1, pipeline rank-2); 45/45 live
legs canonical (4 scaf + 4 tmpl + 5 auth + 5 mob + 8 prog + 3 full +
1 pipe + 4 ai + 3 api + 2 react + 2 page + 2 ent + 2 ori),
2x verdict-identical; focused batch-3 probe 4/4 legs 2x with
byte-identical finding content; 13-shape verdict table; fixtures
removed both runs
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=12 confirmed (no new number; #4 extends with
page-filename dead input — F120; #9 extends with persistent
failure-prose artifact — F116; push-redirect stands refuted)
EXECUTABLE_NOT_VERIFIABLE=0 on 7 swept trunks (92/92 verdict-
mappable; api/react ok:true-with-unproven-flags + scaf.empty
no-op-ok + F113 degraded-stub-ok join the F88 non-checker
passed-constraints — safe today, must gate any allowlist change;
F116 persistent-failure-prose is the FALSE-ARTIFACT direction,
opposite from the hollow passes) + prior shapes (7 hollow
receipts, dead-reuse #10, skip-blind, missing-as-clean/error,
2 always-false-ok)
CHECKER_SET=14/14 (unchanged; 0/13 trunk checkers; L5 live gate
proof still pending for the same 5)
P1_ITEMS=1 new (P1-007 4-root containment F112/F117/F114)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-007 (permissive 4-root containment F112/F117/
  F114): session-bind planner-reachable write roots (scaffold
  baseDir, api/react input.root); re-audit the projectRoot
  allow-rule for writers; validation before model (F119).
- EXTENDED WIRING-P2-004 (14th: auth saml-stub F113; 15th:
  full-stack silent name/type F115; 16th: scaf receipt/base
  mismatch F111; 17th: scaf.empty no-op-ok).
- EXTENDED WIRING-P2-006 (base-escape F111; repo-root base
  F112; builds-root + absolute-inside F114; input.root F117;
  model-before-containment F119; mobile default-cwd +
  Builder default-base code-cited F115).
- EXTENDED MISMATCH #9 (5th instance: persistent
  failure-prose artifact F116 — most severe direction).
- EXTENDED MISMATCH #4 (4th: page filename dead F120;
  repair rides P2-002).
- EXTENDED empty-sideEffects skew beyond browser P2-011
  (web_page_builder writes with sideEffects [] — F122).
- CORRECTED F107 to UNPROVEN (depth-3 ambiguity — F121);
  decisive marker probe is a vcs-trunk follow-up.
- LIFTED nothing; embargoes hold (pipeline named legs +
  setActiveRoot; mobile default-cwd; full-stack {};
  react/api full install+boot; ent/ori default-root;
  page model-present; all PROMPT:-at-scale beyond batch-3;
  all model-present behavior unprobed).

## Corrections to prior checkpoints

- F107 (016) "git default-cwd runs in the default
  workspace, NOT the session" is UNPROVEN: the leg cannot
  distinguish session from default root (both depth 3),
  and the ambient-workspace mechanism (F121) predicts
  session root. Matrix git_ops row + P2-006 note updated
  with this correction; decisive re-probe outstanding.
- The checkpoint-17 pre-registration hypothesis
  'resolveToolPath sandbox rejects outside absolutes' is
  REFUTED as stated: in-project absolutes are ACCEPTED
  (4-root rule); only true outsiders throw (F114).
- The checkpoint-17 pre-registration hypothesis
  'progressive batch-3 writes ERROR placeholders offline'
  is REFUTED: no placeholder appears because routeToModel
  resolves prose instead of throwing, so the prose itself
  is written as code (F116).
- The checkpoint-17 pre-registration hypothesis 'page
  filename controls the artifact name' is REFUTED: the
  input is never read (F120).

## Limits / UNKNOWNs

- 12/19 trunks still unstories; runtime_services=5
  suggested next by impact (planner-adjacent execution:
  run/stop/deploy) or shell_terminal=4; L5 live gate
  proof for 5 checkers remains the alternative
  single-method step; planning_orchestration overlaps
  NVIDIA-owned files — do not story without coordination.
- L5 live gate proof pending for quality_run/auto_tester/
  dep_audit/secrets_scan_repo/code_reviewer (5 checkers).
- website_full_pipeline named behavior + setActiveRoot
  mutation unprobed (safety-probe candidate).
- ent/ori default-root (explorer) landing live-unprobed
  (contained legs prove the tool; root-selection line is
  code-cited).
- react/api full install+boot legs never executed
  (skipInstall positives only).
- web_page_builder model-present build never executed
  (offline failure direction only).
- mobile_builder default-cwd write never executed
  (code-cited only, by design).
- scaffold_full_stack {} never executed (contained
  name-default leg instead, by design).
- PROMPT:-at-scale (medium+) placeholder/failure shapes
  beyond small-scale batch-3 unprobed.
- F107 decisive marker re-probe outstanding (vcs follow-up).
- ai_write_file post-generation write containment
  (resolveToolPath at write time) unprobed — generation
  fails first offline; needs a model-present or mocked
  generation to reach the write.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (ToolService/ExecutionEngine/
  planning read-only cited; CLI-BATCH1 + EVAL-006 +
  registry overlap avoided — probe performs zero source
  edits).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env (note: tsx.cmd breaks
under an extended-path workdir; invoke the cli directly):
  $fx='<worktree>\tmp\wiring-audit\fx-build' (auto-created)
  $env:REAL_TMP=$env:TEMP (capture BEFORE overriding)
  $env:TEMP=$fx\tmp; $env:TMP=$fx\tmp; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=$fx\store; $env:ARTIFACT_DIR=$fx\artifacts
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN unset)
  node .\node_modules\tsx\dist\cli.mjs ..\tmp\wiring-audit\trunk_build.mts
Expected: exit 0; 13/13 SELECTABLE (pipeline rank-2); 45/45 legs
(4 scaf + 4 tmpl + 5 auth + 5 mob + 8 prog + 3 full + 1 pipe +
4 ai + 3 api + 2 react + 2 page + 2 ent + 2 ori); run-2
verdict-identical to run-1; strays (session api/react/evil,
repo-root a.js, builds wiring-build-fx) created + removed;
real api/data/db store untouched. Focused follow-up:
  node .\node_modules\tsx\dist\cli.mjs ..\tmp\wiring-audit\prog_batch3.mts
Expected: exit 0; batch_components_001 ok:true with 5 files;
Component1.tsx head = Arabic no-provider prose, byte-identical
across 2 runs; fixtures removed.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied; api/react/page legs take ~10-60s each cold;
full run ~4 min warm.
