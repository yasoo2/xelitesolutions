# WIRING CHECKPOINT 128 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=5c60e80e (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: project-introspection + analysis-support FIRST live proofs
## (Level 4) over SEVEN unprobed registered families
project_detect + analyze_project + analyze_codebase (non-model paths
only) + secrets_scan_repo + request_analyzer (refusal only) + logger
+ template_manager. All seven were REGISTERED-but-never-live-probed
(registry-vs-probe diff this cycle: 37 safeNew-direct names unprobed;
these seven form the coherent read/analysis/support slice). Both LLM
paths (analyze_codebase summary via routeToModel, request_analyzer
valid input via callLLM) DELIBERATELY UNPROVEN per the 122
precedent (need a provider; router returns an apology STRING on
no-provider rather than throwing, so a naive positive would pin
apology-as-summary — recorded, not executed). SS-{} DELIBERATELY
UNPROBED: required path is unenforced AND the empty default resolves
to the DEFAULT workspace root, so executing it would scan a live
tree and risk real secret-shaped strings in evidence (static note
only). Pipeline/memory/planner NVIDIA-ACTIVE areas NOT touched
(recall_memory/memorize_codebase deep handlers and ProjectRun still
excluded). Every case stays on a SAFE surface: read-only scans over
SEEDED sbx trees, in-memory logger round-trip, pure template data,
refusal/containment pins. NO network is touched (fetch guard
throws), NO model is called, NO browser is launched, NO spend. Same
isolated tsx method as 110-127: canonical test env (setup.ts: JSON
persistence, mock DB, network fetch guard), bypass OFF (hermetic),
full attribution, CWD = the sandbox dir itself (Set-Location INSIDE
the shell — a \\?\ workdir prefix breaks tsx.cmd via CMD.EXE UNC
fallback, proven by the run1 env-failure receipt), all imports
absolute, FS contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT
scoped to tmp/sbx-tmp-128b (run-2; run-1 tree sbx-tmp-128
preserved). NO DATA_DIR is set: the knowledge.ts import-time mkdir
lands in <sbx>/data (contained; Z0 asserts the shape, 127
continuity). NO AUTO_APPROVE_* set at any point. No source edited;
probe runs left ZERO tracked modifications (tracked tree fully
clean after all runs; only pre-existing untracked caches).
Containment verified: fixtures + stores + logs + tsx cache all
inside the sbx; JOE_DATA_DIR inside the sbx; all THREE live stores
byte-identical pre/post (SHA256, in-probe Z0 + outside re-hash);
zero strays outside the sbx. Probe:
tmp/team-consultation/muse-128-dispatch-probe.ts; receipts:
muse-128-dispatch-probe.stdout.log/.stderr.log (UTF-16 via PS
redirect like 110-127 — strip the one-line [Config] preamble, parse
with ReadAllText; TSX_EXIT=0 is the primary verdict, 34/34
regex-confirmed from the JSON block) + .run1 (env-failure, zero
cases) + .run1b (33/34) logs preserved. RUN-2 GREEN (125/127
pattern): run-1b 33/34 disclosed below; the single miss was a
probe-expectation bug over a GENUINE dishonest-ok discovery, zero
other behavior surprises; all 33 other pins held across both runs.
Secret hygiene: SS fixtures are SYNTHETIC shapes built
PROGRAMMATICALLY at runtime (fragments only in authored source,
127/BROWSER-STREAM-002 filter-proof precedent); probe source scans
zero [REDACTED] contamination; receipts contain zero synthetic
secret fragments (findings are type/file/line only — verified by
scan, sk-frag-in-receipt=False).

## Run result: 34/34 PASS run-2, EXIT 0, failed=0
## (run-1b: 33/34, EXIT 1 — receipts preserved; run1: env failure)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset ( Intended:
  unset-or-in-sbx). PASS both runs.
- D0-registered-count: registered=163 (re-observed). PASS both.
- D1-echo-positive: ok=true, output has probe text. PASS both.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; nothing executed). PASS both.
- PD0-detect-missing-path: relative miss -> ok=false 'Path not
  found' (resolves inside sbx, never created). PASS both.
- PD1-detect-positives: default depth -> node=[nodeA]
  python=[pyB] go=[goC], nodeDeep (depth 6) absent. PASS both.
- PD2-detect-maxdepth: depth 10 finds nodeDeep (2 node);
  depth 99 clamps to the identical set (CLAMP pin: max(1,min(10))).
  PASS both.
- PD3-detect-ignoredirs: zero sneaky hits at depth 10
  (node_modules/dist/dot-dir skipped). PASS both.
- PD4-detect-escape: 'C:\Windows' -> ok=false
  path_outside_workspace, touches nothing (throw precedes
  existsSync/scan). PASS both.
- AP0-analyze-positive: Node.js Project + React/Express/
  TypeScript stack + hasDocker=false + structure file map +
  suggestions incl 'Migrating to TypeScript' DESPITE the typescript
  dep (CASE-BUG pin: includes('typescript') lowercase vs
  'TypeScript'). PASS both.
- AP1-analyze-missing-path: ok=TRUE output.status='error'
  message='Path does not exist' (DISHONEST-OK pin: no existsSync
  gate, AnalysisTools.ts:54-67, unlike siblings :100/:202. RUN-1
  probe expected ok=false and failed; behavior is the discovery).
  PASS run-2. (OBS-128-2, P2 proposed.)
- AP2-analyze-unknown: project-less dir -> ok=true type=
  'Unknown' status=success (not an error). PASS both.
- AP3-analyze-default-path: {} -> ok=true type='Unknown'
  (default '.' = contained fresh probe workspace root).
  PASS both.
- AC0-codebase-url-redirect: https URL -> ok=true isRemote +
  suggestedTool browser_run + NO analyze.root log (redirect
  precedes scan AND model). PASS both. (LLM-summary path
  explicitly unproven.)
- AC1-codebase-missing-path: ok=false 'Path not found'.
  PASS both.
- AC2-codebase-escape: 'C:\Windows' -> ok=false
  path_outside_workspace (second live pin of the shared resolver).
  PASS both.
- SS0-secrets-clean: clean tree -> ok=true findings=[]
  scannedFiles=2 (absolute sbx path — relative would resolve to
  the DEFAULT root). PASS both.
- SS1-secrets-positives: ok=false, 5 findings, exact type set
  {aws_access_key, generic_secret_assignment, github_pat,
  openai_key, private_key}, every file RELATIVE, every line=2,
  error 'Found 5' (FULL-HANDLER + FINDING-HYGIENE pins: zero
  secret bytes in output/logs). PASS both.
- SS2-secrets-maxfindings: cap 2 -> findings.length=2 + 'Found
  2'. PASS both.
- SS3-secrets-ignoredir: node_modules/evil.js absent (n stays
  5). PASS both.
- SS4-secrets-textfilter: notes.md absent (.md outside the
  allowlist). PASS both.
- RA0-analyzer-missing-arg: {} -> ok=false needs-userRequest
  refusal, no model call. PASS both. (Valid-input LLM path
  explicitly unproven.)
- RA1-analyzer-blank-arg: whitespace -> same refusal
  (trim-check before any LLM spend). PASS both.
- LG0-logger-clear-hygiene: ok=true clearedCount number
  (fresh-process baseline). PASS both.
- LG1-logger-log: ok=true logId shape log_<ts>_<rand>
  (write-declared tool at default medium, zero approval;
  memory-only). PASS both.
- LG2-logger-cross-workspace: attrB query SEES the LG1 marker
  (UNSCOPED pin: static store, zero partitioning by
  construction; 126-L1 info class — memory-only, no OBS).
  PASS both.
- LG3-logger-stats: totalLogs>=1 byLevel.info>=1. PASS both.
- LG4-logger-unknown-action: ok=false 'Unknown action' (loud;
  inputSchema enum unenforced at dispatch, OBS-111-2 class).
  PASS both.
- LG5-logger-clear-verify: cleared>=1 then stats total=0
  (cleanup pin; process left with zero entries). PASS both.
- TM0-template-list: ok=true 5 templates incl react-app.
  PASS both.
- TM1-template-react: ok=true 8 files name=m128app package.json
  interpolated (data only, zero FS writes). PASS both.
- TM2-template-unknown: ok=false 'not found' (loud; enum
  unenforced, OBS-111-2 class). PASS both.
- TM3-template-missing-arg: {} -> ok=false "Template
  'undefined' not found" (CONTRAST pin: required unenforced
  but handler LOUD vs KS3/KA3 silent defaults). PASS both.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape EXACT
  (db/users.json 2B + memory dir) + live kb hash == pre
  (0F6483C1...) + worktree-root kb hash == pre (6D7A9D7E...) +
  live mem hash == pre (4F53CDA1...) + zero 128 markers in all
  three live stores. PASS both (run-1b tree asserted its own
  sbx; run-2 the fresh tree).

## Behavior pins carried (two new OBS, proposed backlog)
- OBS-128-1 (P3 proposed, STATIC): request_analyzer declares
  permissions=[] / sideEffects=[] DESPITE awaiting a network/
  model/spend callLLM on every valid input (RequestAnalyzerTool
  .ts: callLLM import + await; contrast analyze_codebase ['read',
  'internet']). Permission UNDER-declaration: cost-incurring
  network at default medium with a zero-permission declaration.
  Static evidence is exact-source (105 UNDER-grant precedent);
  live LLM execution deliberately unprobed (122 precedent).
  Repair direction (ownership-gated): declare 'internet' (and the
  spend implication) like the sibling, or carve risk explicitly.
  No edit without ownership.
- OBS-128-2 (P2 proposed, LIVE): analyze_project returns ok:true
  with {status:'error'} for a missing path (AP1 live proof) —
  the execute() has no existsSync gate while BOTH AnalysisTools
  siblings gate identically (PD0/AC1 live contrast in the SAME
  battery). Any downstream verifier/commit-receipt trusting the
  tool ok is UNSOUND for this shape (dishonest-ok class,
  127-2 precedent). Repair direction: one-line existsSync check
  returning ok:false 'Path not found', sibling-precedented.
  Still ownership-gated.
- TM2/TM3/LG4 join the known OBS-111-2 no-dispatch-validation
  class (enum + required unenforced). No new OBS for the class.
  TM3 is the LOUD-vs-SILENT contrast pin: same unenforced class
  as KS3/KA3, opposite failure mode (fails closed with a clear
  error instead of a silent wrong-shape success).
- AP0 case-bug (info pin, no OBS): generateSuggestions fires the
  TypeScript-migration suggestion even when typescript is
  present (lowercase includes vs 'TypeScript'). Advisory-text
  quality only; planner-impact unclaimed.
- Logger description/contract mismatch (static note, 127
  vector-similarity precedent): write-DECLARED with a comment
  claiming file writes + rotation, implemented as a static
  in-memory array with slice truncation. Behavior fully pinned
  and HAS been pinned; the wording misleads risk/selection
  reasoning. No OBS without ownership.
- SS1 finding-hygiene (new live class): findings carry
  {type, relative file, line} with ZERO secret bytes — output
  and logs are safe to persist (receipts scanned clean). The
  relative-path pin also keeps absolute sbx/live paths out of
  persisted evidence. Info pin + class; no OBS (good behavior).
- Default-root divergence (static + live-corroborated class):
  AP-{} lands on the contained probe workspace root (benign,
  AP3 live proof) while SS-{} would land on the DEFAULT root
  and scan a live tree (deliberately unprobed, static note).
  Same {} input, opposite blast radius — the divergence itself
  is the pin. Info class; SS default-root hardening is a
  candidate follow-up, ownership-gated, no OBS filed blind.
- Router apology-string (static note): routeToModel returns an
  apology STRING on no-provider (intelligent-router.ts:1319)
  rather than throwing, so analyze_codebase valid-path would
  surface apology-as-summary at ok:true. Unprobed by design
  (122 precedent); recorded so a future positive battery does
  not mistake degradation for analysis.
- UNC-workdir env finding (method note, no OBS): a \\?\ workdir
  prefix breaks tsx.cmd via CMD.EXE UNC fallback (CWD silently
  becomes C:\Windows; vectorDb import then dies EPERM). Proven
  by the run1 receipt; runbook fix is Set-Location inside the
  shell (probe header updated). Info pin for future batteries.

## Verdict
- TWO new OBS filed to the proposed backlog (128-1 P3 static
  under-declaration, 128-2 P2 live dishonest-ok); three more
  OBS-111-2 class instances noted (TM2/TM3/LG4), no new OBS for
  the class.
- ZERO new orphans (all seven families registered AND live at
  dispatch; ORPHANED stays 5).
- Level-4 dispatch PROVEN for 95 tool-level families (88 prior
  + 7 new: project_detect full-handler incl. depth/clamp/ignore/
  containment shapes + analyze_project positive/unknown/default/
  dishonest-missing shapes + analyze_codebase redirect/refusal/
  containment shapes (LLM path excluded) + secrets_scan_repo
  negative/positive/cap/ignore/filter shapes ({} excluded) +
  request_analyzer refusal shapes (valid path excluded) + logger
  log/query/stats/clear/unscoped shapes + template_manager
  list/positive/refusal/missing shapes, with the gate-vs-handler
  split on EIGHT gate tools + the remote branch, and all four
  risk levels live-pinned). No repairs (audit-first; coordinated
  ownership).
- 084 P4 + all F/OBS items 086-128 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-127 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118/119/120/121/122/123/124/125/126/127; this checkpoint
  adds the 34-case run-2-green introspection battery + two OBS;
  run-1b 33/34 + run1 env-failure receipts preserved).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 128 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=95 tool-level (88 prior + 7 new in 128:
  project_detect + analyze_project + analyze_codebase non-model +
  secrets_scan_repo + request_analyzer refusal + logger +
  template_manager first live proofs via executeTool incl.
  depth/clamp/ignore/containment, dishonest-missing, redirect,
  typed-relative findings, loud refusals, cross-workspace memory
  and catalogue shapes; ai_write positive still unproven — needs
  a model call; analyze_codebase LLM summary + request_analyzer
  valid input still unproven by design — need a provider;
  secrets_scan_repo {} deliberately unprobed — would scan live
  root; delete_file handler still unproven behind the high gate;
  valid browser navigations/actions intentionally unproven;
  dead_code npx + archive shell paths intentionally unproven)
INTROSPECTION_FAMILY_LIVE=7 (PD/AP/AC/SS/RA/LG/TM first proofs)
DISHONEST_OK_MISSING_PATH_LIVE=1 (AP1: ok:true + status error on
  missing path; siblings refuse — OBS-128-2 P2 proposed)
PERMISSION_UNDERDECLARATION_STATIC=1 (request_analyzer [] +
  callLLM; OBS-128-1 P3 proposed)
FINDING_HYGIENE_LIVE=1 (SS1: type/relative-file/line only, zero
  secret bytes in output/logs/receipts)
DEFAULT_ROOT_DIVERGENCE_LIVE=1 (AP-{} contained-benign vs SS-{}
  live-root-dangerous; latter deliberately unprobed)
ORPHANED=5 (tool-level lock UNCHANGED; helper-level dead code
  counted separately)
DEAD_HELPERS=8 (unchanged)
DEAD_REGISTERED_HANDLERS=2 (120 OBS-120-1 stands)
DUPLICATE=2 relationships (unchanged)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; 128 adds THREE more
  instances: TM2/TM3 templateType enum+required, LG4 action enum;
  TM3 fails LOUD — contrast pin vs KS3/KA3 silent defaults)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115) + action/event asymmetry class (116) + gate-vs-guard order
  class (117 + 121 second pin + 123 third pin) + ingress-enforcement
  asymmetry class (118) + verdict-effect asymmetry class (119) +
  pre-gate-shadow class (120) + fallback-scope class (121) +
  envelope-fidelity class (122 + 125 S1 second pin) + splitter-
  mutation class (123) + session-guard-uniformity class (124) +
  registry-miss-short-circuit class (125) + output-key-loss
  class (125) + containment-policy-divergence class (126) +
  subprocess-containment-escape class (126) + verdict-tool-receipt
  class (126) + unscoped-global-store class (127: write at
  medium + global store + import mkdir) + dishonest-ok-write
  class (127: swallowed persist reports ok:true) + recency-floor-
  precision class (127: boost defeats no-match filter) +
  import-mkdir-side-effect class (127) + cwd-store-fragmentation
  class (127: two coexisting kb files by launch dir) +
  dishonest-ok-missing-path class (128: ok:true + status error,
  sibling-gated contrast) + permission-underdeclaration class
  (128 static: zero-permission LLM/spend call) + loud-vs-silent-
  missing-arg class (128: TM3 fails closed vs KS3/KA3 silent
  wrong-shape) + finding-hygiene class (128: typed relative
  findings, zero secret bytes) + default-root-divergence class
  (128: AP-{} benign vs SS-{} dangerous) + unc-workdir-env class
  (128: \\?\ prefix breaks tsx CWD via CMD fallback)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pinned)
DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14+25+21+25+46+26+44+15+34
  (110+111+112+113+114+115+116+117+118+119+120+121+122+123+124+125+126+127+128
  run-2/final probes; 120 run-1 7/13 + 121 run-1 23/24 + 122 run-1
  18/21 + 123 run-1 19/23 + 125 run-1 16/26 + 127 run-1 13/15 +
  128 run-1b 33/34 receipts preserved (+128 run1 env-failure
  receipt); 124 + 126 first-run green, no run-2)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(unprobed: recall_memory/memorize_codebase deep handlers :571-606
— NOTE NVIDIA ACTIVE claim on pipeline/memory/planner areas,
coordinate before probing there; ai_write_file POSITIVE path +
analyze_codebase LLM summary + request_analyzer valid input when
a provider is available; ProjectRun handler depth — same NVIDIA
note; dead_code npx + archive shell paths need owned gateway
review first; secrets_scan_repo {} default-root hardening is a
candidate ownership-gated follow-up) or the next Codex-requested
bounded scope, or OBS-114-1 / OBS-115-1 / OBS-116-1 / OBS-117-1 /
OBS-117-2 / OBS-118-1 / OBS-119-2 / OBS-120-1 / OBS-120-2 /
OBS-121-1 / OBS-121-2 / OBS-122-1 / OBS-123-1 / OBS-125-1 /
OBS-125-2 / OBS-126-1 / OBS-127-1 / OBS-127-2 / OBS-127-3 /
OBS-128-1 / OBS-128-2 ownership/repair proposals at a coordinated
checkpoint. No registry/ToolService/tool edits without ownership.
