# WIRING CHECKPOINT 126 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=5ddb83b9 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — read/inspect + task-lifecycle
## + decision + outline + repo-read + archive-guard FIRST live proofs
## (Level 4)
Follow-up to 125 (next step named remaining unprobed families outside
NVIDIA ACTIVE scope — pipeline/memory/planner areas NOT touched
here). Every case stays on a SAFE surface: guard refusals, read-only
handlers over CONTAINED seed dirs, one broadcast-only lifecycle call
(no WS server = safe no-op per ws.ts:593-596), one pure policy
receipt, and read-only git status/diff in a sandbox dir. NO network is
touched (api_tester refuses before fetch(); dead_code npx path and
archive shell path intentionally never triggered), NO model is
called, NO browser is launched, NO vector store is opened, NO spend.
KnowledgeService family SKIPPED by design (store-root audit owed —
unknown write surface, would risk strays). Same isolated tsx method
as 110-125: canonical test env (setup.ts: JSON persistence, mock DB,
network fetch guard), bypass OFF (hermetic), full attribution, zero
network, CWD = the sandbox dir itself (tsx by absolute path, all
imports absolute), FS contained via EXTERNAL_PROJECTS_DIR +
JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-126 (tree preserved). NO
AUTO_APPROVE_* set at any point. No source edited; probe run left
ZERO tracked modifications (tracked tree fully clean after the run;
only pre-existing untracked caches). Containment verified: fixtures
+ stores + logs + tsx cache all inside sbx-tmp-126; live memory
index SHA256 4F53CDA18C2BAA0C0354BB5F9A3ECBE5ED12AB4D8E11BA873C2F11161202B945
identical to the feas-ap/aq recorded hash; zero strays at the
worktree root or in the live api/data store. Probe:
tmp/team-consultation/muse-126-dispatch-probe.ts; receipts:
muse-126-dispatch-probe.stdout.log/.stderr.log (UTF-16 via PS
redirect like 110-125 — strip the one-line [Config] preamble, parse
with ReadAllText; TSX_EXIT=0 is the primary verdict, 44/44
regex-confirmed from the JSON block). FIRST-RUN GREEN (124 pattern):
no run-2 needed; the only pre-run fix was a probe-authored variable
collision (r1 twice — TS compile error, never a behavior receipt).

## Run result: 44/44 PASS, EXIT 0, failed=0 (first run)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; divergent-shadow finding guarded; nothing
  executed). PASS.
- I1-inspect-positive: {path:'fx/seed126', depth:1} -> ok=true,
  tree=[hello126.ts,notes126.md] (LOW-risk read reaches handler).
  PASS.
- I2-inspect-missing: 'fx/nope126' -> ok=false, EXACT 'Directory
  not found' (GUARD pin UtilityTools.ts:59). PASS.
- I3-inspect-traversal: '../../..' -> ok=false, error INCLUDES
  'path_outside_workspace' inside an internal_exception STACK
  envelope (UNCAUGHT throw at :56 -> dispatch catch :968-979;
  actual starts 'internal_exception: Error:
  path_outside_workspace\n at resolveToolPath ...UtilityTools.ts:
  30:24'). PASS.
- F1-search-files-positive: {'*.md','fx/seed126'} -> ok=true,
  files include notes126.md (MEDIUM-default read — RISK-SPLIT pin:
  same read family as I1, different risk class at :198 vs :202).
  PASS.
- F2-search-files-no-pattern: {} -> ok=true, files=[] (missing
  required pattern NOT enforced: String(undefined)->'undefined'
  glob :107 — another OBS-111-2 no-dispatch-validation instance;
  same known class, no new OBS). PASS.
- F3-search-files-traversal: {'*','../../..'} -> ok=false,
  INCLUDES path_outside_workspace (UNCAUGHT, same shape as I3).
  PASS.
- S1-search-text-positive: {marker,'fx/seed126'} -> ok=true,
  total>=1, match in notes126.md with file+line+text. PASS.
- S2-search-text-no-query: {} -> ok=false, error starts
  'search_text needs a query' (GUARD pin :167 handler-level
  requiredAny). PASS.
- S3-search-text-bad-regex: {'([', regex:true} -> ok=false,
  error starts 'bad_regex: ' (GUARD pin :176-180 — refused
  honestly, never throws to dispatch). PASS.
- S4-search-text-traversal: {'x','../../..'} -> ok=false, error
  EXACT 'path_outside_workspace' (CAUGHT in-handler :169-172 —
  same traversal as I3/F3, opposite SHAPE; third caught-vs-
  uncaught pin after 124 smart family + 125-A1). PASS.
- Y1-symbol-positive: {hello126.ts,'Hello126'} -> ok=true, code
  includes 'class Hello126' + 'greet' (brace-counting extraction
  reaches handler; LOW risk). PASS.
- Y2-symbol-file-missing: -> EXACT 'File not found' (:241). PASS.
- Y3-symbol-missing: 'Nope126ZZZ' -> includes "Symbol
  'Nope126ZZZ' not found in file." (:258). PASS.
- Y4-symbol-no-filepath: {symbolName} only -> ok=false, error
  EXACT 'EISDIR: illegal operation on a directory, read'
  (BEHAVIOR pin: :238 String('')->resolveToolPath('')=workspace
  ROOT :20 -> readFileSync(dir) throws -> caught :286; missing
  required filePath degrades to a directory read, fails closed).
  PASS.
- L1-lifecycle-positive: {update,'probing126',VERIFICATION} ->
  ok=true, output.success=true, log 'Task update: probing126'
  (broadcast no-op, no server). PASS. (WRITE-declared :22 +
  LOW-risk :200 + broadcast-only behavior — plausibly intentional
  for status updates; info pin, no OBS.)
- C1-decision-no-request: {} -> EXACT 'request is required'
  (:32). PASS.
- C2-decision-unsupported-family: unmatched request -> ok=false
  EXACT 'unsupported_capability_family' + supportedFamilies has
  all 5 [ocr,geocoding,storage,speech,routing] (inference returns
  null :143-152). PASS.
- C3-decision-positive: {ocr request, family:'ocr'} -> ok=true,
  selected.id='ocr-local', route='local', userAction=null, log
  'CAPABILITY_DECISION selected local' (deterministic least-
  burden receipt; ZERO_SETUP local wins despite STALE-decayed
  evidence; no connection/credential/payment touched). PASS.
- O1-outline-positive: 'ol126/hello.ts' -> ok=true, classes has
  'L1: Hello126', functions has add126. PASS.
- O2-outline-no-filepath: {} -> EXACT 'filePath is required'
  (:36). PASS.
- O3-outline-missing: 'ol126/nope.ts' -> error starts 'File not
  found: ' with the full resolved path echoed (:41). PASS.
- O4-outline-absolute-accepted: BENIGN sbx-absolute seed path ->
  ok=true, classes=['L1: Hello126'] (CONTAINMENT-DIVERGENCE pin:
  :38-39 honors ANY absolute path with NO root check — opposite
  policy to UtilityTools resolveToolPath AND repo_*
  assertSafeRelativePath, both live-pinned this battery; no
  sensitive file read). PASS. (OBS-126-1, P2 proposed.)
- K1-deadcode-guard: {scan,'dd126-nope'} -> EXACT 'Project path
  does not exist' (GUARD pin DeadCodeTool.ts:52 — refuses BEFORE
  executionEngine.run). PASS. (Live `npx knip` path
  INTENTIONALLY unproven: spawn/network/spend; default workDir
  uses getActiveRoot() with NO workspaceId — the AGENTS.md-
  forbidden pattern — static note, no edit, no OBS without a
  behavior pin.)
- A1-apitester-no-url: {} -> EXACT 'api_tester needs a url to
  call.' (GUARD pin :43 — refuses BEFORE fetch(); zero network).
  PASS. (Also bounds CAPABILITY-MATRIX #5: on a misroute the tool
  asks for url/method, never answers.)
- A2-apitester-non-http: 'ftp://...' -> error starts 'api_tester
  needs an http(s) url' (scheme gate :44-46, before any socket).
  PASS.
- R1-reporead-positive: 'repo126/note.txt' -> ok=true, content
  has marker, bytes>0 (cwd-root pin: resolves vs SBX, not the
  worktree — getRepoRoot()=CWD since basename is not 'api').
  PASS.
- R2-reporead-missing: -> EXACT 'file_not_found' (:115). PASS.
- R3-reporead-not-a-file: 'repo126' -> EXACT 'not_a_file'
  (:116). PASS.
- R4-reporead-no-path: {} -> EXACT 'path_required' (:16). PASS.
- R5-reporead-absolute: sbx-absolute path -> EXACT
  'absolute_paths_not_allowed' (:17 — repo_* refuse absolutes
  outright; codebase_outline O4 ACCEPTS them: opposite policies,
  both live-pinned). PASS.
- R6-reporead-traversal: '../../outside126.txt' -> EXACT
  'path_outside_repo' (:26 isWithinRoot, caught in-handler
  :120-122 — third containment SHAPE: exact message, no stack;
  vs I3/F3 stack envelopes vs S4 exact handler message). PASS.
- R7-reporead-env-blocked: '.env' -> EXACT
  'secrets_file_write_blocked' (POLICY pin :19-23: blocklist
  fires BEFORE containment AND existence — a write-NAMED guard
  blocks READS too; behavior is fail-closed, naming is the only
  finding — note, no OBS). PASS.
- Q1-reposearch-no-query: {} -> EXACT 'query_required' (:143).
  PASS.
- Q2-reposearch-positive: {marker,'repo126',max10} -> ok=true,
  count>=1, match repo126/note.txt line 2 (scoped walk, 800-file
  cap, 240-char previews). PASS.
- Q3-reposearch-traversal: {'x','../../..'} -> EXACT
  'path_outside_repo' (:144 scoped base through the same assert).
  PASS.
- G0-repodiff-nonrepo: {} -> ok=false with git stderr captured
  (BEHAVIOR pin :264-279: hardcoded status+diff via direct
  runSafeCommand — bypasses isAllowedCommand BY CONSTRUCTION
  since the strings are constants; actual stderr shows git's
  upward discovery REACHED the enclosing worktree repo from the
  sbx CWD and failed closed on sandbox dubious-ownership, NOT on
  non-repo — process-CWD containment does NOT bind git
  subprocesses; read-only either way; matches the tool's
  documented repo-summary intent — info pin, no OBS). PASS.
- V1-archive-no-sources: {create,'x126.zip'} -> EXACT
  'sourcePaths required for create action' (:86 — refuses BEFORE
  ExecutionGateway shell). PASS.
- V2-archive-no-path: {} -> EXACT 'archivePath is required'
  (:69-71, before format detection). PASS.
- V3-archive-unknown-action: {'frob126','x126.zip'} -> EXACT
  'Unknown action: frob126' (:182). PASS. (Live create/extract/
  list INTENTIONALLY unproven: ExecutionGateway shell + the zip
  branch's `2>/dev/null || true` unix-ism need owned review.)
- Z0-containment: fx=[hello126.ts,notes126.md] + ol=[hello.ts] +
  repo=[note.txt] intact; live memory store len=2 hash=b62
  (SHA256 re-confirmed separately, identical to feas-ap/aq);
  strays=false,false,false (worktree-root archive, deadcode dir,
  parent-dir traversal target). PASS.

## Behavior pins carried (one new OBS, proposed backlog)
- OBS-126-1 (P2 proposed): codebase_outline honors arbitrary
  absolute paths with NO containment check
  (CodebaseOutlineTool.ts:38-39). UtilityTools (resolveToolPath)
  and repo_* (assertSafeRelativePath) both enforce roots — three
  policies across four read tools, live-pinned in ONE battery
  (O4 vs I3/F3/S4/Y4 vs R5/R6). A workspace-escape READ
  primitive reachable at dispatch under default medium risk.
  Repair direction (ownership-gated): resolve through
  resolveToolPath(p, workspaceId) or assertSafeRelativePath;
  keep cwd-relative default for back-compat. No edit without
  ownership. NOTE: O3 echoes the full resolved path in the
  error — same-hunk hygiene if repaired.
- F2 joins the known OBS-111-2 no-dispatch-validation class
  (required pattern unenforced; confident empty files:[] —
  same wrong-answer SHAPE the search_text header comment
  documents for the old grep_search alias). No new OBS.
- Y4: missing required filePath degrades to a workspace-ROOT
  directory read and fails closed with an engine EISDIR — no
  validation, but no escape either (root is inside the root).
  Info pin, no OBS.
- R7: secrets blocklist fires before existence — '.env' is
  refused even when absent (no existence oracle). Fail-closed;
  only the write-named-on-read naming is notable. No OBS.
- L1: write-declared + low-risk + broadcast-only. The explicit
  :200 low carve-out is plausibly intentional (status updates
  must not need approval); the 'MUTATES task state' comment
  describes a WS event, no durable write observed. No OBS.
- G0: git subprocesses escape process-CWD containment via
  upward repo discovery (documented git behavior, read-only
  here, matches tool intent). Future batteries must not assume
  CWD-containment binds child processes. No OBS.
- K1 static note: DeadCodeTool default workDir calls
  getActiveRoot() with NO workspaceId — the exact pattern
  AGENTS.md forbids in ToolService. Unchanged by this probe
  (guard-only pin); needs an owned behavior pin before any
  OBS. No OBS.
- V3 static note: ArchiveFilesTool zip-create branch carries
  `2>/dev/null || true` (unix-only) then statSyncs the archive
  — on failure the stat throws ENOENT into the catch, so the
  branch still fails closed (ok:false 'Archive operation
  failed'), but the original zip error is swallowed. Needs
  owned gateway review. No OBS.
- api_tester (A1/A2) never answers without url+http(s): the
  CAPABILITY-MATRIX #5 misroute ('test' word -> api_tester
  asking for URL/method) is now dispatch-bounded — the tool
  side fails closed with a precise prompt for the missing
  contract. The ROUTING defect stays open; the TOOL side is
  pinned safe.
- decide_capability_route (C1/C2/C3) is a pure receipt: no
  connection, credential, payment, or persistence path exists
  in the handler — policy-verdict tools CAN be fully proven at
  Level 4 with zero side effects. Template for future verdict-
  tool batteries.
- KnowledgeService family (knowledge_search/add) DELIBERATELY
  unproven: store-root unknown, write surface unknown. Proving
  it needs a store-root audit first (same discipline as the
  125 LanceDB no-effect pin). Deferred, not dropped.

## Verdict
- ONE new OBS filed to the proposed backlog (126-1 P2,
  outline containment); two more OBS-111-2 class instances
  noted (F2), no new OBS for the class.
- ZERO new orphans (all 13 families resolved to live handlers
  or documented guard surfaces; ORPHANED stays 5).
- Level-4 dispatch PROVEN for 86 tool-level families (73 prior
  + 13 new: 9 full-handler — inspect_directory, search_files,
  search_text, inspect_symbol, task_lifecycle,
  decide_capability_route, codebase_outline, repo_read_file,
  repo_search — plus 4 guard/behavior — dead_code_detector,
  api_tester, archive_files, repo_diff_summary) with the
  gate-vs-handler split on EIGHT gate tools + the remote
  branch, and all four risk levels live-pinned. No repairs
  (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-126 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-125 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118/119/120/121/122/123/124/125; this checkpoint adds the
  44-case first-run-green dispatch battery + one OBS; no run-2).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 126 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=86 tool-level (73 prior + 13 new in 126:
  9 full-handler first live proofs via executeTool
  (inspect_directory + search_files + search_text +
  inspect_symbol + task_lifecycle + decide_capability_route +
  codebase_outline + repo_read_file + repo_search) + 4
  guard/behavior surfaces (dead_code_detector + api_tester +
  archive_files + repo_diff_summary); knowledge family
  deliberately unproven — store-root audit owed; ai_write
  positive still unproven — needs a model call; delete_file
  handler still unproven behind the high gate; valid browser
  navigations/actions intentionally unproven; dead_code npx +
  archive shell paths intentionally unproven)
INSPECT_READ_FAMILY_LIVE=11 (I1/I2/Y1/Y2/Y3 positives+guards;
  I3/F3 UNCAUGHT traversal stack envelopes; S4 CAUGHT exact
  traversal message; F2 missing-pattern unenforced; Y4
  missing-filepath EISDIR fail-closed; F1 risk-split pin)
RISK_SPLIT_READ_FAMILY_LIVE=1 (inspect_* LOW :198 vs
  search_files/search_text MEDIUM default :202 — same family,
  different classes, both reach handlers)
LIFECYCLE_LOW_WRITE_PIN_LIVE=1 (L1 write-declared + low-risk +
  broadcast-only; info, no OBS)
DECISION_RECEIPT_LIVE=3 (C1 exact guard + C2 null-family shape
  with 5 supported + C3 ocr-local least-burden receipt,
  userAction=null)
OUTLINE_CONTAINMENT_DIVERGENCE_LIVE=1 (O4 benign-absolute
  accepted; OBS-126-1 P2 proposed; O1/O2/O3 positive+guards)
REPO_READ_FAMILY_LIVE=10 (R1/R2/R3/R4 positives+guards; R5
  absolute-refused vs O4 accepted; R6/Q3 traversal exact; R7
  .env write-named block on reads; Q1 guard; Q2 scoped
  positive; G0 git-upward-discovery info pin)
CONTAINMENT_SHAPES_LIVE=3 (uncaught stack envelope I3/F3;
  caught exact handler message S4/R6; outright absolute refusal
  R5 — vs O4 no-check divergence)
APITESTER_GUARD_LIVE=2 (A1 exact no-url + A2 scheme gate; zero
  network; MATRIX-#5 tool side bounded)
DEADCODE_GUARD_LIVE=1 (K1 pre-spawn refusal; npx path
  unproven; getActiveRoot()-without-id static note)
ARCHIVE_GUARD_LIVE=3 (V1/V2/V3 guard trio; shell path
  unproven; `2>/dev/null || true` static note)
ORPHANED=5 (tool-level lock UNCHANGED; helper-level dead code
  counted separately)
DEAD_HELPERS=8 (unchanged)
DEAD_REGISTERED_HANDLERS=2 (120 OBS-120-1 stands)
DUPLICATE=2 relationships (unchanged)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; 126 adds ONE more
  instance: F2 search_files required-pattern)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115) + action/event asymmetry class (116) + gate-vs-guard order
  class (117 + 121 second pin + 123 third pin) + ingress-enforcement
  asymmetry class (118) + verdict-effect asymmetry class (119) +
  pre-gate-shadow class (120) + fallback-scope class (121) +
  envelope-fidelity class (122 + 125 S1 second pin) + splitter-
  mutation class (123) + session-guard-uniformity class (124) +
  registry-miss-short-circuit class (125) + output-key-loss
  class (125) + containment-policy-divergence class (126: three
  enforced root policies + one no-check tool across four read
  tools) + subprocess-containment-escape class (126: git upward
  discovery escapes process-CWD binding) + verdict-tool-receipt
  class (126: pure policy receipts fully provable at Level 4)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pinned)
DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14+25+21+25+46+26+44
  (110+111+112+113+114+115+116+117+118+119+120+121+122+123+124+125+126
  run-2/final probes; 120 run-1 7/13 + 121 run-1 23/24 + 122 run-1
  18/21 + 123 run-1 19/23 + 125 run-1 16/26 receipts preserved;
  124 + 126 first-run green, no run-2)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(unprobed: knowledge_search/add AFTER a store-root audit;
recall_memory/memorize_codebase deep handlers :571-606 — NOTE
NVIDIA ACTIVE claim on pipeline/memory/planner areas,
coordinate before probing there; ai_write_file POSITIVE path
when a provider is available; ProjectRun handler depth — same
NVIDIA note; dead_code npx + archive shell paths need owned
gateway review first) or the next Codex-requested bounded
scope, or OBS-114-1 / OBS-115-1 / OBS-116-1 / OBS-117-1 /
OBS-117-2 / OBS-118-1 / OBS-119-2 / OBS-120-1 / OBS-120-2 /
OBS-121-1 / OBS-121-2 / OBS-122-1 / OBS-123-1 / OBS-125-1 /
OBS-125-2 / OBS-126-1 ownership/repair proposals at a
coordinated checkpoint. No registry/ToolService/tool edits
without ownership.
