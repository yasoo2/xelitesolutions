# MUSE Wiring Discovery 030 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 30)
HEAD=d9817281 + this checkpoint (survey/docs only, no source edits)
DATE=2026-09-30
METHOD=read-only static survey of workers/jobs/queues/background surface
(survey_workers.ps1): services/ + extension/ tree inventory, compose service
parse, alias-aware route mount map (31 routes), name-based candidates
(worker/queue/schedul/cron/job/background/timer) + mechanism markers
(worker_threads, child_process, setInterval/setTimeout, job libs,
BROWSER_WS_ENDPOINT/WORKER_API_KEY, browser-server calls, global.joe*)
across api/src + web/src production files, single-pass import index
(static import/require + dynamic import()) for importer counts.
Filed runs A/B SHA256-identical (F098D591...B25E95B4). Two pilot runs
preceded the filed pair and are honestly discarded: pilot-1 died on a
PowerShell quote-escape parse error, pilot-2 on a PS5.1 ternary parse
error, pilot-3 ran green (DC048AB8...) but with a basename-only mount
check that false-flagged 5 alias-mounted routes; the filed runs use the
corrected alias-aware check (31/31 mounted). No live process survived;
no source edits; architecture + package-scripts guards re-verified green.
EVIDENCE=tmp/wiring-audit/fx-workers/survey_workers.ps1 + fx_workers.json
+ fx_workers_run{A,B}.json + fx_workers_run{A,B}.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=checkpoint 29 (services 15/15, evidence in fx-services/ + staging,
filed in d9817281; no 029 narrative doc exists — this file continues the
checkpoint numbering, it does not backfill 029).
NOTE=WORKERS=UNKNOWN is now closed by this survey (see staging summary).

## Scope (background surface, not a tool trunk)

services/ tree, extension/ tree, infra compose services, all 31 API
routes (mount map), every worker/queue/timer-named file, every
timer/child-process/worker-thread/job-lib/browser-server marker hit.
110 candidates surveyed; high-signal rows verified by exact source read.

## New findings (all Muse-branch @ d9817281; main-parity checked)

### F216. /queue/* route is mounted but callerless; live queue path is /sessions/:id/queue (DUPLICATE)

api/src/api/routes/queue.ts (global.joeQueues, in-memory per-session
queue) is mounted at /queue (app.ts:18,281) and authenticated, but has
ZERO in-repo callers: no useTaskQueue hook exists in web/src (the route
header comment names it), and no /queue/* fetch exists in web/src.
CommandComposer queue UI uses /sessions/:sid/queue (tsx:919,948) served
by sessions.ts:28-29 -> sessionController.ts:577,589. Two overlapping
per-session queue implementations; only the sessions one is called.
Same on main (route + mount identical) -> inherited, not Muse-made.
PRIMARY_STATE=DUPLICATE (of sessions-queue) + callerless. -> P2-051.

### F217. TaskTracker.tsx is an unrendered component on a live channel (ORPHANED UI)

web/src/components/TaskTracker.tsx (default export, progress-ring UI)
is the SOLE subscriber of SocketService.subscribeTaskTracker
(socket.ts:850) and has ZERO importers repo-wide (api+web/src+
extension+services scan: only its own file + socket.ts state fields +
one compat comment). The channel itself is LIVE: server todo_update
(ws.ts:525, TodoWriteTool.ts:53) feeds taskTrackerData via the
socket.ts:517-524 compat mapping ("'task_tracker' was never a server
event"). So live data flows into a subscription whose only consumer is
never rendered. Same on main (file present) -> inherited.
PRIMARY_STATE=ORPHANED (component) + consumerless-compat-mapping.
-> P2-052. (Dynamic-import blind spot ruled out: lazy() importers are
indexed — SystemManagement.tsx correctly resolves to main.tsx:18.)

### F218. joe-browser-worker is a wired deploy-gated service (FULLY_WIRED, not orphan)

services/joe-browser-worker (6 files: on-demand Chromium over HTTP
control :7070 + ws :5050, fail-closed WORKER_API_KEY, idle shutdown)
is built+run by BOTH compose files (production: browser-worker svc,
server: browser-worker svc + WORKER_API_KEY required), consumed by
api/src/modules/browser/manager.ts (:705, :1303 via
BROWSER_WS_ENDPOINT/WORKER_API_KEY, 10 browser-server callsites) with
local-launch fallback when unset, and its key is covered by
secrets.ts:142 + redaction.ts:12. Local dev without the env never
touches it. Present on main too. Disposition stands, no backlog item.

### F219. Background-mechanism census (no job framework; timers + procs + worker svc)

- Job libs: ZERO hits for BullMQ/bee/p-queue/node-cron/Agenda across
  api+web src. Joe has no queue framework; background work is ad-hoc.
- worker_threads: ZERO real uses. The only 2 hits
  (dependency-healer.ts:35, AIGeneratorTool.ts:167) are module-name
  strings inside allow/deny lists, not Worker construction.
- setInterval sites: 21 files under api/src+web/src (ws heartbeat,
  ToolService rateLimitCleanup:22, ExecutionEngine, browser manager x2,
  telemetry, DeployManager poller:278, AIGeneratorTool,
  BrowserSmartTools, react-app-templates x2 [generated-template code,
  not Joe-runtime], 9 web UI polling sites incl. TaskTracker) + 1 in
  services/ (worker idle shutdown). All api-side sites have non-test
  importers or entry status; no new orphan beyond F217.
- child_process: ExecutionEngine (x6) + ExecutionEnforcer (x5) +
  ExecutionGuard (x2) + 2 allow-list mentions. Centralized, expected.
- Routes: 31/31 mounted with exact paths (5 alias-mounted: run->/runs,
  formsPublic->/public/forms, browserAgent->/browser-agent,
  sentinel->/admin/sentinel, projectPreview->/project-preview via
  require). Zero unmounted route modules.
- extension/ (6 files, manifest v3, background service_worker):
  manifest-wired browser companion, EXTERNAL to the Joe API runtime
  (not counted as a Joe-runtime worker).

### F220. Method controls (no false orphans filed)

- api/src/api/index.ts (imp=0): server boot ENTRY (enforcer+guard+
  listen side effects), correctly unimported. Not orphan.
- SystemManagement.tsx: lazy()-routed via main.tsx:18 (dynamic import
  indexed after pilot correction). Not orphan.
- 5 "unmounted" pilot flags: all alias-mounted (see F219). Survey
  corrected and re-run; pilot JSON discarded, never filed.

## Counts (this checkpoint, Muse branch)

ROUTE_FILES=31 MOUNTED=31 UNMOUNTED=0
TIMER_FILES=21 (api/web src) + 1 (services/)
JOB_LIBS=0 WORKER_THREADS_REAL=0
BROWSER_WORKER=FULLY_WIRED (deploy-gated)
NEW_ORPHANED=1 (TaskTracker.tsx UI) NEW_DUPLICATE=1 (/queue/* route)
INHERITED=3/3 key items identical on main (queue route+mount,
TaskTracker file, browser-worker tree)

## Staging updates (this checkpoint)

- JOE-WIRING-AUDIT-SUMMARY.md: WORKERS surveyed line, ORPHANED +1 UI,
  DUPLICATE_ROUTES=1, NEXT_DISCOVERY_STEP advanced.
- JOE-ORPHAN-AND-LEGACY-REGISTER.md: +TaskTracker + queue-duplicate rows.
- JOE-WIRING-REPAIR-BACKLOG.md: +P2-051 (queue disposition) +P2-052
  (TaskTracker disposition), both UNASSIGNED.
- JOE-ACTUAL-ARCHITECTURE.md: workers row SURVEYED.
- Matrix staging: no per-row change (services were likewise kept out of
  the per-tool matrix in checkpoint 29; dispositions live in register).
