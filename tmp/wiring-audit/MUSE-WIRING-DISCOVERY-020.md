# MUSE Wiring Discovery 020 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 20)
HEAD=84693d36 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for database_data 6/6 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root fixtures created + removed by the probe; seeder
outputs tracked via the tool-returned path and removed; orders_read global
entry pointed at fixtures only and restored; sqlite via node:sqlite;
NO network legs; no model legs) + static checker partition over the
trunk + pure-function verdict table over source-grounded shapes. Full trunk
probe ran 3x total (1 pre-fix pilot + 2 filed runs A/B with 28/28 legs
verdict-identical: ok + error-prefix + output-shape). No live process
survived; no stray files (session root clean, seeder parent removed,
no escape file).
EVIDENCE=tmp/wiring-audit/trunk_db.mts + trunk_db_run{A,B}.json +
trunk_db_run{1,2,3}.log (this worktree; run1 = pre-fix pilot, runs 2/3 = filed A/B)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-019.md (shell_terminal LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

database_data = db_schema_migrator, json_query, large_data_seeder,
orders_read, query_datasource, query_optimizer (6). All 6 exist in the
live registry. 0/6 are task-level checkers.

## New findings (all Muse-branch @ 84693d36)

### F143. json_query missing-path returns ok:true with a value that VANISHES from the receipt (LIVE 2x, MISMATCH #15 NEW + P2-025 NEW)

jq.missing ({a:1}, path 'a.b.c') -> ok:true + output `{}` BOTH runs:
the tool returns {value: undefined} and JSON serialization drops the
key entirely. The receipt therefore cannot distinguish "path missing"
from "path present with value null" from "path present with value
undefined" — three different facts, one identical receipt. The
verdict table maps the shape PASSED ('json missing-value=>passed').
The TOOL is partially honest (it executed the lookup); the RECEIPT
loses the answer and the CONSUMER is blind — a behavior check built
on json_query ("flag X is true") would close PASSED on a missing
flag. Sibling of #14 (dryRun-blindness) with the loss happening one
layer earlier (serialization, not mapping). Repair direction (batch
P2-025): return an explicit found:boolean (or preserve null vs
missing distinctly) and make the verdict mapping fail a behavior
check on found:false. NOT implemented here (audit-first).
Note: jq.empty-path ('') returns the WHOLE document (parts=[] skips
the loop) — documented here as observed behavior, no verdict impact.

### F144. query_optimizer description promises EXPLAIN ANALYZE, executes heuristics (LIVE 2x, P2-026 NEW)

qo.bad/qo.clean -> ok:true + analysis 'Heuristic Static Analysis
(Connect DB for true EXPLAIN)' BOTH runs; the tool description says
'Analyze SQL queries for performance bottlenecks using EXPLAIN
ANALYZE'. The OUTPUT is honest (it names itself heuristic); the
PLANNER-FACING description is not — a planner selecting this tool
believes a real EXPLAIN ran, and verification evidence citing
'query_optimizer passed' overstates what was measured. qo.clean
(WHERE + LIMIT, no SELECT *) yields suggestions:[] — the heuristic
itself behaves sanely. Repair direction (batch P2-026): correct the
description to heuristic static analysis (or implement a live-EXPLAIN
mode behind an explicit flag) + fix F150 below in the same batch.

### F145. large_data_seeder rows:0 generates 1000 rows (LIVE 2x, P2-027 NEW)

seed.zero (rows:0) -> ok:true + 12788-byte file BOTH runs; readback
shows the file starts at row 0 and runs long (1000-row default).
Mechanism: `Math.max(1, Math.min(Number(input?.rows) || 1000, 1M))` —
explicit 0 is falsy, so it becomes the 1000 default
(DatabaseEnterpriseTools.ts:258). An explicit "zero rows" request is
silently converted into 1000 rows of disk writes. Same mechanism maps
NaN -> 1000 (code-cited, not live-probed); negatives -> 1 (code-cited).
Repair direction (batch P2-027): distinguish absent/NaN (default 1000)
from explicit 0 (reject or honor as no-op with an honest receipt).

### F146. large_data_seeder writes land OUTSIDE the session dir (LIVE 2x + readback, P2-006 EXTENDED 6th instance)

seed.csv/seed.json/seed.zero all landed under
data/builds/workspace-default/wiring-db-fx-<token>/ (tool-returned
path, read back + removed) — NOT under the session root
data/projects/session-audit-sess. Mechanism: the seeder calls
resolveToolPath(raw, {sandbox:true}) with NO workspaceId, so the
sandbox forcing redirects to the session-agnostic builds default
(utils.ts:64-77). Containment HOLDS (seed.escape absolute-outside
REFUSED both runs; no escape file), but session isolation does not:
one session's seed files land in a shared default dir. 6th instance
of the P2-006 no-context/session-agnostic family (cf. F114 auth-root
split, same forced default). Repair rides P2-006 (pass session
context through + keep the sandbox default only as a fallback).

### F147. db_schema_migrator sqlite path TRUE POSITIVES under \\?\ roots (LIVE 2x)

db.migrate -> ok:true + 'Applied SQL migration ... to ...probe.db';
db.status -> tables:[{wiring_probe}]; db.migrate2 (engine:'prisma' +
.sql) -> ok:true via the documented file-type override (the .sql
suffix correctly beats the stale prisma default); db.empty ->
'Migration file is empty'; db.missing -> 'SQLite migration file not
found'; db.badaction -> 'Unsupported SQLite action: vacuum' — ALL
both runs. Independent rowcheck via node:sqlite: 2 rows after the
two migrate legs (schema idempotent via IF NOT EXISTS, INSERT data
additive — expected, documented). Key contrast with F135: node:sqlite
ACCEPTS the `\\?\`-prefixed paths that cmd.exe cannot start in, so
the sqlite path is immune to the P1-010 trigger. Shape note (no
backlog): db.status nests a JSON STRING inside output.output
(consumers must parse; parseable, not hollow). Unprobed by design:
reset action (code-cited rmSync), schema auto-discovery (workspace
walk could migrate a real .sql into a real nexus.db), status with no
databasePath (creates a stray nexus.db), prisma engine (npx network).

### F148. orders_read all five legs honest, both DB branches proven (LIVE 2x)

or.noentry -> no-API guidance; or.nodb -> database-not-created
guidance; or.empty -> empty-orders message + orders:[]; or.json ->
2 orders listed latest-first (id 2 before id 1, token in message);
or.sqlite -> 1 order via node:sqlite with '(SQLite)' source label
(token in message) — ALL both runs; global joeProjects entry
restored afterwards. Layered-defense note (sibling of F140):
orders_read is ROUTER_EXCLUDED=true yet SELECTABLE_BY_KEYWORD rank-1
via selectToolsFor — exclusion bites at the router layer, not at
selection. Security note (no new finding): customer phone numbers
are echoed into the chat message BY DESIGN (owner reads own orders);
the tool trusts context.sessionId for the joeProjects lookup, so the
TOOL-HTTP-OWNER-GATE session-spoofing theme applies here too —
recorded as overlap, not a new defect.

### F149. query_datasource unknown-source honest; real sources embargoed with static defects (LIVE 1 shape 2x + static, P2-028 NEW)

ds.unknown -> ok:false + full available-sources error, no fetch
attempted, BOTH runs; the gateway passed the leg to the tool (tool
error, NOT approval_required), so the declared ['internet']
permission alone does not preempt execution. All 8 real sources
embargoed (network). Static defects for the batch (code-cited,
DatasourceTool.ts): (a) ip_geolocation uses plaintext http://ip-api.com
while every other source uses https; (b) NONE of the 8 fetch calls
carries a timeout or AbortSignal — an unresponsive endpoint hangs the
tool call unboundedly (reliability sibling of the provider-lease
theme; no Real Joe incident claimed). Repair direction (batch P2-028):
https for ip-api + bounded timeout/abort on all 8 fetches.

### F150. query_optimizer accepts {} despite required:['sql'] (LIVE 2x, rides P2-026)

qo.nosql ({}) -> ok:true + 'Missing WHERE clause' suggestion BOTH
runs: String(undefined)='UNDEFINED' flows into the heuristic and earns
a nonsense suggestion. Neither the tool (no input guard) nor the
gateway (no schema-required rejection observed) enforces the declared
required contract. Consequence today is a nonsense suggestion, not
false success. Repair rides P2-026 (same tool): reject missing sql
with a sentence before analysis.

### F151. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 6/6, all rank-1 on self-name.
db_schema_migrator + query_datasource are priority-listed;
orders_read is router-excluded (see F148). json_query is among the
21 boot permission-defaulted tools (->read; same systemic family as
summary finding #4; boot list UNCHANGED at 21). query_optimizer
declares ['internet'] but executes pure-local heuristics — the
declaration overstates the need (no gateway preemption observed
either way; recorded so a future 'internet-gated' claim is checked,
not assumed). `[ToolService] Auto-assigned workspace context:
session-audit-sess` fired on legs (context propagation visible).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probes abort unless 163)
TRUNK_STORIES=10/19 fully storied (database_data 6/6 LEVEL-4 + static
verification-compat + checker-set 0/6; orders sqlite branch + seeder
readback + migrator rowcheck are L5-grade legs) — 101 + 6 = 107 tools
TRUNK_DB=6/6 SELECTABLE rank-1; 28/28 live legs canonical 3x total
(1 pilot + filed runs A/B verdict-identical: ok + error-prefix +
output-shape); 14-shape verdict table; fixtures removed (seeder
parent removed, global entry restored, session root clean)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=15 confirmed (NEW #15: json_query missing-path
receipt loses the answer + verdict maps PASSED — F143)
EXECUTABLE_NOT_VERIFIABLE=0 on 10 swept trunks (107/107 verdict-
mappable; missing-value-ok joins as MAPPING-false-pass (#15) —
receipt-loss + consumer-blindness; optimizer-nonsense (F150) is an
input-guard defect, not a verdict-mapping defect)
CHECKER_SET=14 task-level + project_run live-gate-only (unchanged;
0/6 trunk task-level checkers)
P1_ITEMS=0 new (P1-010 stands) | P2_ITEMS=4 new (P2-025 missing-value
receipt F143, P2-026 optimizer honesty F144+F150, P2-027 seeder
rows:0 F145, P2-028 datasource fetch bounds F149) + P2-006 extended
(6th instance F146)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P2-025 (json_query missing-path receipt F143, MISMATCH
  #15): return explicit found:boolean (or equivalent) + verdict must
  not close a behavior check on found:false.
- NEW WIRING-P2-026 (query_optimizer honesty F144+F150): correct the
  EXPLAIN ANALYZE description to heuristic static analysis (or add a
  real live-EXPLAIN mode) + reject missing sql with a sentence.
- NEW WIRING-P2-027 (seeder rows:0 F145): distinguish absent/NaN
  (default 1000) from explicit 0 (reject or honest no-op).
- NEW WIRING-P2-028 (datasource fetch bounds F149): https for ip-api
  + timeout/AbortSignal on all 8 fetches.
- EXTENDED WIRING-P2-006 (6th no-context instance: seeder
  session-agnostic landing F146).
- LIFTED nothing; embargoes hold (all datasource real sources;
  migrator prisma engine/discovery/no-path-status; seeder 1M-row cap
  unprobed; orders cross-session behavior; all model-present
  behavior unprobed).

## Working hypotheses (formed at source-read, before first run)

- 'missing-path query fails loudly' — REFUTED: ok:true + {} (F143).
- 'empty path is rejected' — REFUTED: returns the whole doc (F143 note).
- 'optimizer runs EXPLAIN' — REFUTED: heuristics, honest label (F144).
- 'optimizer rejects missing sql' — REFUTED: nonsense suggestion (F150).
- 'rows:0 writes nothing' — REFUTED: 1000 rows (F145).
- 'seeder writes land in the session dir' — REFUTED: shared
  builds default (F146); 'escape is refused' — CONFIRMED.
- 'migrator works under \\?\ roots' — CONFIRMED (F147; sqlite
  immune where cmd.exe is not).
- 'engine:prisma + .sql misroutes to prisma' — REFUTED: file-type
  override routes sqlite (F147).
- 'orders sqlite branch works disk-direct' — CONFIRMED (F148).
- 'orders router-exclusion blocks selection' — REFUTED: rank-1
  selectable, exclusion is router-layer (F148).
- 'unknown datasource fails without fetch' — CONFIRMED (F149).
- 'declared internet permission preempts execution' — REFUTED for
  the probed shape: tool error, not approval_required (F149).

## Limits / UNKNOWNs

- 9/19 trunks still unstories; memory_knowledge overlaps
  NVIDIA-claimed files and planning_orchestration is NVIDIA-owned —
  do not story without coordination. Suggested next: observability=5
  or interaction=8 (central_answer needs model embargo care) or
  infra_ops=6 (likely honest-unavailable legs).
- F143 repair needs a verdict-semantics decision (is a missing-path
  lookup a failed check, or data?): batch proposes found:false +
  check-fails, owner to confirm.
- query_datasource real-source behavior entirely UNKNOWN (embargo);
  F149b is static-only.
- db reset/discovery/no-path-status legs embargoed with stated
  stray-write reasons; prisma engine UNKNOWN.
- Seeder 1M cap + negative/NaN rows code-cited only.
- orders_read cross-session isolation not probed (global-key
  mechanism + owner-gate overlap noted, no exploit attempted).
- C:\Windows\Temp escape-file check may be sandbox-unreadable
  (absence recorded as cleanup ok + tool refusal, not as a
  filesystem proof).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (probes perform zero source edits;
  CLI-BATCH1 review duty retained, no committed NVIDIA diff exists
  yet to review).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env (note: the sandbox CWD arrives as
`\\?\`-prefixed, which node cannot resolve relatively — reset the
process directory and invoke node with ABSOLUTE paths):
  [System.IO.Directory]::SetCurrentDirectory('D:\Joe\muse-worktree\api')
  $fx='<worktree>\tmp\wiring-audit\fx-db' (auto-created)
  $env:TEMP=Join-Path $fx 'tmp'; $env:TMP=Join-Path $fx 'tmp'
  $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true'
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=Join-Path $fx 'store'
  $env:ARTIFACT_DIR=Join-Path $fx 'artifacts'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN unset)
  node D:\Joe\muse-worktree\api\node_modules\tsx\dist\cli.mjs D:\Joe\muse-worktree\tmp\wiring-audit\trunk_db.mts
Expected: 6/6 SELECTABLE rank-1; 28 legs, 18 ok; rowcheck 2 rows;
or.sqlite ok with (SQLite) label; seed.zero ~12KB file; node process
exits 0 by itself.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied (hence the fx tmp redirect); full trunk run ~1 min.
