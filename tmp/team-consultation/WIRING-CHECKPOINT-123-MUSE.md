# WIRING CHECKPOINT 123 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=92fb01ab (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — git_ops FIRST live proof +
## npm_manager FIRST live proof + docker_manager FIRST live proof +
## terraform/kubernetes/swarm guard-depth FIRST live proof +
## ssh-remote branch FIRST live proof (Level 4)
Checkpoints 100-102 mapped these families by source reads only (git
arg shapes, ssh lifecycle, npm/docker/infra spawn shapes). 123 takes
the same claims to LIVE dispatch via the REAL executeTool path. Every
case stays on a SAFE surface: guard refusals (pre-spawn), read-only
local spawns (git status/rev-parse, npm --version, read-only docker
ps), or the zero-network ssh isConnected gate. NO network op is ever
sent: no push/fetch/pull/clone, no install with a package, no valid
kubectl/terraform/swarm spawn, and no metachar payload that could
execute (F-102-2 stays source-level by design). Same isolated tsx
method as 110-122: canonical test env (setup.ts: JSON persistence,
mock DB, network fetch guard), bypass OFF (hermetic), full
attribution, zero network, CWD = the sandbox dir itself (tsx by
absolute path, all imports absolute), FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-123
(run-1) and tmp/sbx-tmp-123b (run-2 FRESH dir; run-1 tree preserved
untouched). NO AUTO_APPROVE_* set at any point. No source edited;
probe runs left ZERO tracked modifications (tracked tree fully clean
after run-2; only pre-existing untracked caches). Containment
verified: fixtures + stores + logs + a fresh git repo + tsx cache all
inside the two sbx dirs; read-only absence checks prove nothing landed
at D:/Joe/git123-repo, tmp/git123-repo, D:/Joe/deep123.txt or the
worktree root. K2's `docker ps -a` is read-only intent against the
local daemon (no FS writes); N4's `npm --version` is read-only and
offline. Probe: tmp/team-consultation/muse-123-dispatch-probe.ts;
receipts: muse-123-dispatch-probe.stdout.log/.stderr.log = RUN-2 (UTF-16
via PS redirect like 110-122 — parse with ReadAllText; TSX_EXIT=0
is the primary verdict, 25/25 regex-confirmed from the JSON block),
plus .run1.stdout.log/.run1.stderr.log preserved before the rerun.

## Run-1: 19/23 (TSX_EXIT=1) — disclosed, receipts preserved
Three misses are ONE probe-environment interaction, not product
defects: sbx-tmp-123 sits INSIDE the D:/Joe/muse-worktree checkout,
git climbs out of the sandbox dir into the enclosing repo, and the
sandbox identity (muse-sbx-u1) is not the repo owner — so git itself
refused with 'dubious ownership' before any product assertion could
bite (G2/G3/G4). The fourth miss (B2) is a probe-READING bug with a
REAL finding inside: InfrastructureTools splitCommandLine (:33-41) is
a regex tokenizer that DROPS a lone quote instead of refusing, so
'"unterminated-123' became `kubectl unterminated-123`, a spawn was
attempted, kubectl is absent, the handler returned ok:false with NO
error key, and ToolService :945-946 substituted the generic message.
Run-2 re-targets G2/G3/G4 at a fresh in-sandbox repo (owned by the
probe identity, outside the attributed workspace dir), adds G6 (the
climb, machine-independent) and B2b (lone-quote guard reachability),
and re-pins B2 on the actual strip+substitution behavior as
OBS-123-1. No source touched between runs; only probe expectations +
fresh sandbox.

## Run-2 result: 25/25 PASS, EXIT 0, failed=0
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; divergent-shadow finding guarded; nothing
  executed). PASS.
- G1-git-op-metachar: operation='status;x' -> ok=false,
  error='invalid_git_operation' + dispatch start line (GUARD pin
  GitTools.ts:28-30, zero spawn). PASS.
- G2-git-status-freshrepo: status in the fresh sandbox repo ->
  ok=true, output has 'On branch master' + 'No commits yet'
  (LIVE argv-spawn + success shape). PASS.
- G3-git-cwd-outside-accepted: rev-parse --show-toplevel with an
  absolute cwd under sbx but OUTSIDE probe-ws-123 -> ok=true,
  toplevel EXACTLY the foreign repo path (F-100-3 LIVE,
  deterministic: no context param, no safePath, read-only). PASS.
- G4-git-arg-literal: --verify 'a;b$(x)' -> ok=false, error has
  'Needed a single revision' (ARGV pin: git received ONE literal
  revision — no shell split on ;, no $(x) substitution; the
  GitTools.ts:13-25 lesson holds live). PASS.
- G5-git-no-cwd-ambient: no cwd -> a git-shaped result, never
  workspace_required/unauthorized/approval/containment (AMBIENT
  pin :107; this env: the dubious-ownership shape). PASS.
- G6-git-climbs-out-of-sandbox: rev-parse --show-toplevel with a
  clean non-repo sandbox cwd -> dubious-ownership error HERE
  (the climb reached the enclosing checkout), toplevel incl
  muse-worktree on an owner machine — and NEVER 'not a git
  repository' (CLIMB pin: git upward search leaves the sandbox
  dir; compounds F-100-3; inherent git semantics). PASS.
- N1-npm-missing-command: {} -> ok=false error='missing_command'
  (GUARD pin :1212). PASS.
- N2-npm-install-no-package: install + package into a dir with no
  package.json -> ok=false 'npm_install_target_is_not_a_package'
  + refused log line (TARGET-REFUSAL pin :1256-1268, pre-spawn;
  zero network). PASS.
- N3-npm-cwd-outside-refused: absolute D:/Joe cwd -> ok=false
  error starts 'path_outside_workspace: ', npm.args logged,
  npm.cwd ABSENT (CONTAINMENT pin :1216-1222: refusal precedes
  the cwd log — the exact input git accepts live in G3). PASS.
- N4-npm-version-live: --version -> ok=true, output 11.16.0
  (LIVE spawn pin: real local npm, read-only, offline). PASS.
- K1-docker-unknown-action: bogus action -> ok=false 'Unknown
  action' (GUARD pin DockerManagerTool.ts:53, engine never
  invoked). PASS.
- K2-docker-ps-shape: ps + empty options -> ok=true (docker IS
  present), logs carry 'Executed: docker ps -a ' (ENGINE pin:
  dispatch reached executionEngine.run through the template-join
  path; read-only ps only). PASS.
- T1-terraform-missing-action: {} -> exact action guard
  (GUARD pin :92-94). PASS.
- T2-terraform-missing-dir: plan without directory -> exact
  directory guard (GUARD pin :95, before resolveToolPath). PASS.
- B1-kubectl-missing-command: {} -> exact command guard
  (GUARD pin :170). PASS.
- B2-kubectl-quote-stripped: '"unterminated-123' -> ok=false,
  error='Tool reported failure without an error message', logs
  carry 'executed: kubectl unterminated-123' (STRIP pin: lone
  quote DROPPED, spawn attempted, kubectl absent, handler
  returned no error key, :946 substituted — OBS-123-1). PASS.
- B2b-kubectl-lone-quote: '"' alone -> ok=false
  error='invalid_command' (GUARD-REACHABILITY pin :175: only a
  tokenless command reaches the guard). PASS.
- W1-swarm-missing-action: {} -> exact action guard
  (GUARD pin :212-214). PASS.
- W2-swarm-missing-stack: remove_stack without stackName ->
  ok=false 'stackName required' (GUARD pin :230: the
  destructive action refuses before args are built). PASS.
- R1-remote-not-connected: 'echo hello' + bogus serverId ->
  ok=false error='Not connected to server probe-no-such-123'
  (REMOTE-GATE pin :71-72 + TOOL-NORMALIZE pin :1708-1714:
  zero network — isConnected map check first — and the throw
  is caught at the tool boundary; CORRECTS 100 OBS-100-4).
  PASS.
- R2-remote-high-gate: 'docker ps' + serverId -> ok=false
  error='approval_required' (GATE-BEFORE-REMOTE pin :159/
  :782-783: high-risk never reaches commandRouter — third
  gate-vs-guard order pin after T5-117/X2-121). PASS.

## OBS-123-1 (kubectl splitter silently strips unbalanced quotes
## instead of refusing — mangled args reach the shell sink; :172
## null-check dead; :946 substitution hides the stderr; P2)
B2 proves at LIVE dispatch level that the InfrastructureTools
splitCommandLine (InfrastructureTools.ts:33-41) is NOT the refusing
splitter 100 described: the regex tokenizer has no failure mode for
an unbalanced quote — it matches around it. '"unterminated-123'
became the single token 'unterminated-123' (lone quote dropped, no
refusal, no mutation log), the tokens were rejoined into shell:true
via spawnWithTimeout (the F-101-2 sink, another live instance),
kubectl is absent on this machine so the spawn failed, the handler
returned {ok:false, output, logs} with NO error key (:181-184
non-throw path), and ToolService :945-946 substituted 'Tool reported
failure without an error message' — hiding kubectl's real stderr
(second live pin of the R1-114 substitution class). Two compounding
contract defects: (a) :172 `if (!parts)` is DEAD — the splitter
returns string[], never null (only [] for zero tokens); the
' wish-to-refuse' shape the code promises does not exist; (b) only a
tokenless command (B2b: a lone '"') reaches 'invalid_command' :175 —
EVERY quotable typo containing text sails into the shell sink. Blast
radius: a model typo like `"delete pod X` (stray leading quote)
executes as `kubectl delete pod X` against whatever cluster the
machine is pointed at — the tool's own comment (:167-169) admits
that context is ambient. This is a correctness AND safety defect in
an infra-mutation tool, distinct from F-101-2 (which covers the
join-then-shell sink, not the silent pre-mutation). Smallest fix
direction (NOT implemented — audit-first, coordinated ownership):
make the splitter return null on unbalanced quotes (wiring the
existing :172 check for real) or refuse token-count-changing input,
and give the non-zero-code path a real error (pass through stderr)
so :946 stops hiding spawn failures. Proposed repair-backlog item
(P2 silent infra-command mutation; cf. OBS-121-1 P2). No unilateral
edit.

## CORRECTION: 100 OBS-100-4 DOWNGRADED (remote-throw is
## tool-normalized — asymmetry is internal-only)
R1 live-proves the 100 claim wrong at the tool boundary: the
executeRemote throw ('Not connected to server <id>') IS caught by
the ShellExecuteTool try/catch (:1597/:1708-1714) and returned as
structured ok:false with the gate message as `error`. No raw
exception escapes executeTool. The throw-vs-return asymmetry between
executeRemote and executeLocal remains TRUE inside the router
(source-level), but it is invisible to callers — the planner sees a
normal refusal. OBS-100-4 is therefore DOWNGRADED from minor
contract asymmetry to an internal-style note; no backlog item
needed. The audit corrects its own source-only overclaim with live
evidence — kept visible here so no later reader re-opens it.

## Behavior pins carried (no new OBS)
- F-100-3 is now LIVE (G3/G5/G6 triple): git_ops honors an
  absolute foreign cwd (G3 exact-toplevel), uses an ambient
  default when cwd is absent (G5), and git's own upward search
  escapes even a clean sandbox cwd (G6). The npm contrast is
  live in the SAME battery (N3 refuses what G3 accepts).
- F-101-2 gains another live instance (B2's kubectl spawn went
  through join-then-shell); scope unchanged, no new F.
- R1-114 substitution class: second live pin (B2). Callers of
  kubectl/swarm/terraform non-zero exits get the generic message,
  not the tool stderr — planner-guidance loss, same family as
  OBS-122-1 (envelope strip).
- Gate-vs-guard order class: third pin (R2 gate-before-remote;
  T5-117 run_command, X2-121 delete_file). Unapproved high-risk
  callers can never reach the router's remote branch.
- Machine facts (this worktree, not product claims): docker
  present (K2 ok=true); npm 11.16.0; git ownership gate bites
  for the sandbox identity on the enclosing checkout (G6
  run-1 shape). K2/N4/G2 spawns are hermetic and read-only.
- ai_write positive path REMAINS unproven (by design, zero
  spend). delete_file handler REMAINS unproven behind the high
  gate. Valid kubectl/terraform/swarm spawns are INTENTIONALLY
  unproven (unguarded infra mutation is out of audit scope).

## Verdict
- ONE backlog-grade finding (OBS-123-1: kubectl silent quote
  strip + dead :172 + :946 hiding, P2), proposed for the repair
  backlog at team ownership decision, alongside standing OBS-114-1,
  OBS-115-1/115-2, OBS-116-1/116-2, OBS-117-1/117-2, OBS-118-1/118-2,
  OBS-119-1/119-2, OBS-120-1/120-2, OBS-121-1/121-2, OBS-122-1.
- ONE self-correction (OBS-100-4 downgraded by live evidence).
- F-100-3 PROMOTED from source-level to LIVE (triple-pinned).
- Level-4 dispatch PROVEN for 33 families (123 adds git_ops +
  npm_manager + docker_manager + terraform_manager +
  kubernetes_ops + docker_swarm_ops + shell_execute-remote-branch
  first live proofs) with the gate-vs-handler split on EIGHT gate
  tools + the remote branch, and all four risk levels live-pinned.
  No repairs (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-123 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-122 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118/119/120/121/122; this checkpoint adds the 25-case run-2
  dispatch battery + OBS-123-1 + the OBS-100-4 correction; run-1
  19/23 receipts preserved).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 123 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=33 families (110-122 twenty-six + 123:
  git_ops + npm_manager + docker_manager + terraform_manager +
  kubernetes_ops + docker_swarm_ops + shell_execute-remote-branch
  first live proofs via executeTool; ai_write positive path still
  unproven — needs a model call; delete_file handler still unproven
  behind the high gate; valid kubectl/terraform/swarm spawns
  intentionally unproven)
AI_WRITE_POSITIVE_PROVEN=NO (by design: zero spend; guard-depth only)
AI_WRITE_GUARD_PROVEN=YES (122 stands)
GIT_OPS_LIVE=1 (G1 op-guard + G2 status success + G3 foreign-cwd
  exact-toplevel + G4 argv-literal + G5 ambient + G6 climb)
GIT_CWD_UNCONTAINED_LIVE=1 (F-100-3 PROMOTED to live: G3 exact
  foreign toplevel; G5 ambient; G6 climb compounds it)
GIT_ARGV_LITERAL_LIVE=1 (G4: metachar revision parsed literally)
GIT_CLIMB_LIVE=1 (G6: upward search leaves the sandbox dir;
  machine-independent pin shape)
NPM_MANAGER_LIVE=1 (N1 guard + N2 target-refusal + N3 containment
  + N4 version spawn 11.16.0)
NPM_CONTAINMENT_CONTRAST_LIVE=1 (N3 refuses the foreign input G3
  accepts — same battery, both live)
DOCKER_MANAGER_LIVE=1 (K1 guard + K2 engine shape; F-102-2 stays
  source-level by design — no metachar target sent)
DOCKER_PRESENT=1 (K2 ok=true; machine fact, not product claim)
TERRAFORM_GUARD_LIVE=2 (T1 action + T2 directory exact messages)
KUBECTL_GUARD_LIVE=1 (B1 exact message)
KUBECTL_QUOTE_STRIP_LIVE=1 (B2: lone quote dropped, spawn attempted,
  :946 substituted — OBS-123-1 P2, proposed backlog, unowned)
INVALID_COMMAND_REACHABILITY=1 shape (B2b: tokenless input only)
DEAD_NULL_CHECKS=1 (:172 `if (!parts)` — splitter never returns null)
SWARM_GUARD_LIVE=2 (W1 action + W2 stackName exact messages)
REMOTE_GATE_LIVE=1 (R1: exact 'Not connected' message, zero network)
REMOTE_GATE_NORMALIZED=1 (R1: tool catch :1708-1714 returns ok:false —
  OBS-100-4 DOWNGRADED to internal-style note, no backlog needed)
GATE_BEFORE_REMOTE=1 (R2: high-risk never reaches the router; third
  gate-vs-guard order pin)
ERROR_SUBSTITUTION_LIVE=2 (R1-114 + B2-123: handlers returning ok:false
  without error get the generic message; stderr hidden)
RATE_LIMITER_LIVE=1 (122 A7 stands)
ENVELOPE_STRIP_LIVE=1 (122 OBS-122-1 stands)
NULL_OUTPUT_PINS=2 (122 stands)
START_LINE_PINS=2 (122 A1 + 123 G1 second pin)
SCAFFOLD_PARTIAL_WRITE=1 (122 stands)
SCAFFOLD_VALUE_COERCION=1 (122 stands)
SCAFFOLD_VACUOUS_OK=1 (122 stands)
SCAFFOLD_PREFIX_STRIP=1 (122 stands)
SCAFFOLD_SESSION_REGISTER=1 (122 stands)
WRITE_FILE_POSITIVE_PROVEN=YES (110 stands)
DELETE_HANDLER_PROVEN=NO (X1/X2/X3 gate verdicts only; needs an
  approved-approval harness)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pinned; R2 pins
  the remote branch behind the same gate)
GATE_BEFORE_GUARD_PINS=3 (T5-117 run_command + X2-121 delete_file +
  R2-123 remote branch; order class)
RESOLVED_NAME_RISK_PINS=2 (115/121 stand)
FALLBACK_ESCAPE_LIVE=1 (121 OBS-121-1 stands)
REFUSAL_PINS=7 (121 W8+E7 + 122 S3/S4 + 123 N3 containment + G1 op-guard)
WS_FILE_SCOPING_LIVE=YES (121/122 stand; git explicitly UNSCOPED per
  G3/G5/G6 — F-100-3 live)
STRING_AS_OPTIONS_CALLS=1 (121 OBS-121-2 stands)
FIRST_OCCURRENCE_EDIT=1 (121 stands)
RAW_ERRNO_SURFACES=2 (119/121 stand)
ABS_PATH_IN_EDIT_ERRORS=1 (121 stands)
GATE_BYPASS_LIVE=2 tools (120 OBS-120-1 stands)
SHIM_SHADOW_DUPLICATES=1 family (120 stands)
ENVELOPE_BYPASS_LIVE=1 (120 stands)
STALE_JUSTIFYING_COMMENT=1 (120 stands)
MEMORY_REPLACE_NOT_MERGE=1 (120 OBS-120-2 stands)
MEMORY_CROSS_WORKSPACE=1 (120 OBS-120-2 stands)
RISK_LEVELS_LIVE=4/4 (114 stands; 123 re-exercises low D1/R1 +
  medium G/N/K/T/B/W + high via H4/R2 gate verdicts)
RISK_SPLIT=tool-x-input (unchanged; git_ops push/commit=high per
  :170-174 untested live — no push/commit sent by design)
SESSION_OVERRIDE_LIVE=YES (119 stands)
SCOPED_ISOLATION_LIVE=YES (118/119/121/122 stand; git layer
  explicitly excepted per G3/G5/G6)
UNSCOPED_TERMINAL_ACTIONS_REACHABLE=5/6 (118/119 stand)
SILENT_NOOP_VERDICTS=5 (119/120 stand)
READ_MISSING_THROWS=1 (119 stands)
WS_TOOL_OWNERSHIP_ASYMMETRY=1 (118/119 stand)
SHADOW_QUARTET_PINNED=4/4 (118 stands; H4 re-pinned in 123)
DIVERGENT_SHADOW=2 (run_command; memory family pre-gate)
GATE_BEFORE_HANDLER_EMPTY_INPUT=1 (122 H4 re-pinned in 123)
GATE_REGEX_ASYMMETRY=1 (OBS-114-1)
ALIAS_SHADOW_LAYERS=1 (OBS-115-2 class; OBS-118-2 family-complete)
MONITORING_ACTION_BLIND_MEDIUM=1 (OBS-115-1; MONITORING-010-NVIDIA
  review pending)
CACHE_ACTION_BLIND_MEDIUM=1 (OBS-116-1)
MONITORING_EVENT_SILENT_ACCEPT=1 (OBS-116-2)
PYTHON_WINDOWS_DEAD_BINARY=1 (OBS-117-1)
CONTENTTOOLS_VALIDATION_MAP=COMPLETE (OBS-115-3)
ERROR_SUBSTITUTION_PINNED=1 (:946 generic message live via R1-114;
  second instance B2-123)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; 123 adds NINE more handler-guard
  instances: G1/N1/N2/K1/T1/T2/B1/W1/W2)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115) + action/event asymmetry class (116) + gate-vs-guard order
  class (117 + 121 second pin + 123 third pin) + ingress-enforcement
  asymmetry class (118) + verdict-effect asymmetry class (119) +
  pre-gate-shadow class (120) + fallback-scope class (121) +
  envelope-fidelity class (122) + splitter-mutation class (123:
  tokenizers that silently rewrite instead of refusing, + dead
  null-checks promising a refusal shape that cannot arrive)
RESOLVER_PARITY_LIVE=YES (112/115/121/122 stand)
DISPATCH_LOG_ENVELOPE=PARTIAL (113/115/122 stand; 123 G1 second
  start-line pin + K2 Executed-line pin)
DISPATCH_RETURN_KEYS=5 (122 S6 stands)
ALIAS_TABLE_PROVEN=5 chains (110/113/115/117/121 stand)
ORPHAN_REPIN=1 (image_generate->generate_image->unknown_tool, 110)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
READ21_R1_CLOSED=21/21 (080/104/105 stand)
FIREWALL_R2_CLOSED=YES (106 stands)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DEAD_REGISTERED_HANDLERS=2 (120 OBS-120-1 stands)
DUPLICATE=2 relationships (unchanged)
FIREWALL_DEAD_BRANCHES=1 (workspace_required, F-106-1)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=12 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14+25+21+25 (110+111+112+113+114+115+116+117+118+119+120+121+122+123 run-2 probes, 120 run-1 7/13 + 121 run-1 23/24 + 122 run-1 18/21 + 123 run-1 19/23 receipts preserved)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(unprobed: ai_write_file POSITIVE path when a provider is available,
browser smart families beyond browser_run, ProjectPipeline/ProjectRun
handler depth — NOTE NVIDIA ACTIVE claim on pipeline/memory/planner
areas, coordinate before probing there) or the next Codex-requested
bounded scope, or OBS-114-1 / OBS-115-1 / OBS-116-1 / OBS-117-1 /
OBS-117-2 / OBS-118-1 / OBS-119-2 / OBS-120-1 / OBS-120-2 / OBS-121-1 /
OBS-121-2 / OBS-122-1 / OBS-123-1 ownership/repair proposals at a
coordinated checkpoint. No registry/ToolService/tool edits without
ownership.
