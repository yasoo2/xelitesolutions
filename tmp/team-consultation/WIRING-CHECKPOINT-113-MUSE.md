# WIRING CHECKPOINT 113 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=f74041e0 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only)

## Scope: dispatch-reachability battery, families 12-14 (Level 3)
Follow-up to 112 (next step named payments/http_fetch medium-path
contract, task_lifecycle, remaining high-risk gate pins). For one
representative tool per family this probe executes the REAL
executeTool path (alias layer -> registry -> firewall -> approval
gate -> handler) with inputs each layer provably rejects BEFORE any
side effect, plus positive/defaults pins whose effect is provably
inert in this hermetic process. Same isolated tsx method: canonical
test env (setup.ts: JSON persistence, mock DB), bypass OFF
(hermetic), full attribution, NO sessionId, zero network, FS
contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to
tmp/sbx-tmp-113. NO AUTO_APPROVE_* set at any point: medium/low
cases reach the handler through the default allowance, G1 meets
the gate. Ran from the plain DOS path, TSX EXIT 0. No source
edited; probe runs left ZERO tracked modifications (verified via
git status on api/src + web/src after run: only pre-existing
untracked cache entries). Containment tree verified: test stores
+ empty projects/ + tsx cache, all inside sbx-tmp-113; nothing
outside. Probe: tmp/team-consultation/muse-113-dispatch-probe.ts;
receipts: muse-113-dispatch-probe.stdout.log/.stderr.log (same
dir; UTF-16 via PS redirect like 110/111/112 — parse with
ReadAllText; TSX_EXIT=0 is the primary verdict, 10/10
regex-confirmed).

## Result: 10/10 PASS, EXIT 0, failed=0 (second run)
FIRST RUN was 9/10: H1 asserted handler-shape logs=0, but dispatch
prepends a start line (ToolService.ts:623) so actual was logs=1.
The CODE was right and the EXPECTATION was wrong: :623/:929 were
source-traced, H1 was corrected to the envelope shape (start line
only, handler adds zero lines), and the rerun passed 10/10 with
all other cases untouched. Both runs are reported; the committed
receipts are the second run.
- P0-preconditions: bypass=unset, isSystem=false, stripe=unset,
  sbx=set. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (110/111/112
  control reproduced). PASS.
- H1-http-handler: http_fetch {} -> ok=false, error='url
  required', logs=1 envelope_only=true (HANDLER
  ContentTools.ts:24-26 pre-fetch; dispatch :623 start line is
  the sole entry, handler added zero lines — zero network
  proven). PASS (run 2; run-1 expectation error, mine).
- H2-fetch-alias: fetch_url {} -> ok=false, error='url required'
  (ALIAS TOOL_ALIASES fetch_url->http_fetch, ToolService.ts:248,
  then the same handler). PASS.
- H3-html-handler: html_extract {} -> ok=false, error='url
  required' (HANDLER ContentTools.ts:53-55 pre-fetch;
  network-family breadth). PASS.
- M1-payments-config: payments_create_checkout_session
  {amount:1000, productName:'probe-113'} -> ok=false,
  error='stripe_not_configured' (HANDLER PaymentsTool.ts:63-71
  config gate BEFORE the Stripe import and any network, even
  for otherwise-valid input; probe refused to call unless the
  key env is unset — it was unset). PASS.
- T1-lifecycle-positive: task_lifecycle
  {action:'update', taskStatus:'probe-113', mode:'EXECUTION'} ->
  ok=true, success=true (HANDLER TaskLifecycleTool.ts:28-45;
  risk low, ToolService.ts:200; effect is a ws broadcast and
  stderr shows liveWssRef-null no-ops — inert in this hermetic
  process). PASS.
- T2-lifecycle-defaults: task_lifecycle {} -> ok=true (HANDLER
  :29 defaults action to 'update'; inputSchema.required=
  ['action'] NOT enforced at dispatch). PASS.
- G1-delete-gate: delete_file {path:'probe-113-no-such-file.txt'}
  -> ok=false, error='approval_required', risk=high (GATE,
  classifyToolRisk name branch /(delete|deploy)/,
  ToolService.ts:196 — first line-196 pin; gate fires BEFORE
  the handler's safePath/exists/unlink path at
  SystemTools.ts:828-851, so no FS effect possible). PASS.

## OBS-113-1 (dispatch log envelope, methodology correction)
Every executeTool call carries a dispatch-added start line (:623)
with handler logs appended after (:929). A handler `logs: []`
therefore surfaces as logs=1 envelope-only — which H1 now pins
live, including the exact `start http_fetch (orig=http_fetch)`
shape. General value: (a) all future handler-log assertions must
use the envelope shape, not the handler-return shape; (b) the
envelope is a forensic asset — unlike the run4b-class gate
verdict that omitted the offending contract, dispatch ALWAYS
records which tool was entered, so handler rejections stay
attributable even when the handler logs nothing.

## OBS-113-2 (config-gate layer class)
M1 proves a pre-effect layer class beyond 112's
presence/resolve/exists/switch taxonomy: the ENVIRONMENT/CONFIG
gate. PaymentsTool checks STRIPE_SECRET_KEY before the dynamic
Stripe import, so valid input + missing config rejects with zero
network and zero module load. Validation-depth records should
gain this layer: presence -> config -> resolve/contain ->
exists -> switch. Note the asymmetry: the config gate makes the
payments family SAFE-by-default in this environment, while the
network family (H1/H3) is safe only because the test input omits
the URL — with a URL present, http_fetch WOULD fetch. Depth and
default-deny posture must be recorded per (tool, input-class).

## OBS-113-3 (name-based vs input-sensitive risk)
G1 is the first pin of the coarse name branch (:196): delete_file
meets high by name SUBSTRING, with no input inspection. Contrast
with the input-sensitive branches proven earlier (deploy action,
git operation, shell command shape, browser instruction/actions):
risk taxonomy now has BOTH granularities live-proven. Practical
consequence: any future tool whose name contains 'delete' or
'deploy' inherits high automatically — including the specific
deploy_project early-return that SHADOWS :196 for that one name
(112). The matrix should flag :196 as implicit-inheritance risk
for new tool names.

## Verdict
- No new SIGNIFICANT defects. Level-3 dispatch PROVEN for
  14 families (110: echo/file-read/file-write/shell/terminal
  + 111: browser/git/npm + 112: deploy/docker/image + 113:
  network/payments/lifecycle) with the gate-vs-handler split
  now proven on FOUR gate tools and input-sensitivity on TWO
  same-tool pairs. No repairs (audit-first; coordinated
  ownership).
- 084 P4 + all F/OBS items 086-113 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-112 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112; this checkpoint
  adds the 10-case dispatch battery + OBS-113-1/2/3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 113 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=14 families (110: echo, read_file,
  write_file, shell_execute, terminal_manager + 111:
  browser_run, git_ops, npm_manager + 112: deploy_project,
  docker_manager, image_studio + 113: http_fetch, html_extract,
  payments_create_checkout_session, task_lifecycle — live
  executeTool)
DISPATCH_GATE_PROVEN=4 tools (shell_execute default high,
  110; git_ops push high, 111; deploy_project expose_port
  high, 112; delete_file name-based high, 113 — approval gate)
RISK_SPLIT=tool-x-input (G1+G2 same-tool both-layers, 111;
  P1+P2/P4 second pin + gate-before-handler order, 112;
  name-based coarse branch pinned, 113)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at
  dispatch; handlers self-validate, OBS-111-2; third pin on a
  low-risk tool via T2, 113)
VALIDATION_DEPTH_PINNED=3 layers deploy (presence/resolve+
  contain/exists/switch; P2/P3/P4, 112) + config-gate layer
  class (payments pre-import, M1, 113)
RESOLVER_PARITY_LIVE=YES (in-probe resolveToolPath ==
  handler resolution, P4, OBS-112-3)
DISPATCH_LOG_ENVELOPE=YES (:623 start line + :929 handler
  append; envelope-only shape pinned live, H1, OBS-113-1)
ALIAS_TABLE_PROVEN=2 chains (shell->shell_execute gate+handler,
  110; fetch_url->http_fetch handler, 113)
ORPHAN_REPIN=1 (image_generate->generate_image->unknown_tool, 110)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
READ21_R1_CLOSED=21/21 (5 write in 080 + 16 read in 104/105)
FIREWALL_R2_CLOSED=YES (106: 6/6 probe PASS, EXIT 0)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DUPLICATE=2 relationships (unchanged)
FIREWALL_DEAD_BRANCHES=1 (workspace_required, F-106-1)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=0 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10 (110+111+112+113 probes, run-2 receipts committed for 113 with run-1 9/10 disclosed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to the remaining highest-value families
(browser_run sensitive-text gate needs isSafeLocalBrowserQa
analysis first; shell curl input-class; rss_fetch contract) or
the next Codex-requested bounded scope, or F-106-1
ownership/repair proposal at a coordinated checkpoint. No
registry/ToolService/tool edits without ownership.
