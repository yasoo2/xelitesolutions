# WIRING CHECKPOINT 127 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=a2608239 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: knowledge_search / knowledge_add FIRST live proofs
## (Level 4) + KnowledgeService store-root audit closure
Follow-up to 126 (knowledge family was DELIBERATELY unproven there
— store-root audit owed; this battery IS that audit: static part
first, live part only inside a DATA_DIR-scoped sandbox).
Pipeline/memory/planner NVIDIA-ACTIVE areas NOT touched (recall_
memory/memorize_codebase deep handlers and ProjectRun still
excluded). Every case stays on a SAFE surface: read-only search
over a SEEDED sbx store, contained writes into DATA_DIR=<sbx>/kdata
only, one dir-swap failure-injection with full restore (KA5). NO
network is touched, NO model is called, NO browser is launched, NO
vector store exists to open (description says 'vector similarity'
but search() is deterministic keyword scoring — static
contract/description mismatch note, no OBS without ownership),
NO spend. Same isolated tsx method as 110-126: canonical test env
(setup.ts: JSON persistence, mock DB, network fetch guard), bypass
OFF (hermetic), full attribution, zero network, CWD = the sandbox
dir itself (tsx by absolute path, all imports absolute), FS
contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT + DATA_DIR
scoped to tmp/sbx-tmp-127b (run-2; run-1 tree sbx-tmp-127
preserved). DATA_DIR is referenced ONLY by knowledge.ts
(repo-wide search) — no other module shares this store. NO
AUTO_APPROVE_* set at any point. No source edited; probe runs left
ZERO tracked modifications (tracked tree fully clean after both
runs; only pre-existing untracked caches). Containment verified:
fixtures + store + logs + tsx cache all inside the sbx; BOTH live
kb files byte-identical pre/post (SHA256); live memory index
SHA256 4F53CDA18C2BAA0C0354BB5F9A3ECBE5ED12AB4D8E11BA873C2F11161202B945
identical to the feas-ar/as recorded hash; zero strays outside the
sbx. Probe: tmp/team-consultation/muse-127-dispatch-probe.ts;
receipts: muse-127-dispatch-probe.stdout.log/.stderr.log (UTF-16
via PS redirect like 110-126 — strip the one-line [Config]
preamble, parse with ReadAllText; TSX_EXIT=0 is the primary
verdict, 15/15 regex-confirmed from the JSON block) + .run1 logs
preserved. RUN-2 GREEN (125 pattern): run-1 13/15 disclosed below;
both run-1 failures were probe-expectation bugs, zero behavior
surprises; all 13 other pins held across both runs.

## Run result: 15/15 PASS run-2, EXIT 0, failed=0
## (run-1: 13/15, EXIT 1 — receipts preserved)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, data_dir_in_sbx=true,
  data_dir_exists=true (import-time mkdir already fired with
  DATA_DIR). PASS both runs.
- D0-registered-count: registered=163 (re-observed). PASS both.
- D1-echo-positive: ok=true, output has probe text. PASS both.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; nothing executed). PASS both.
- KS0-search-empty-store: {query:'zz-no-match-127-q'} on missing
  store -> ok=true, results=[], knowledge.json NOT created
  (READ-ONLY pin: loadKnowledge catch :24-32 writes nothing).
  PASS both.
- KS1-search-positive: {query:'orchard'} on 1-doc seed ->
  ok=true, n=1, first=seed127.txt score=0.46 with id/snippet/
  0<score<=1 + 'knowledge.search=' log (FULL-HANDLER pin:
  keyword scoring + /50 normalization + slice(0,10) :68-118).
  PASS both.
- KS2-search-no-match: {query:'zz-no-match-127-q'} on seeded
  store -> ok=true, n=1, score=0.04 (PRECISION pin: recency +2
  ALONE clears the score>0 filter :115 — EVERY doc <7 days old
  matches EVERY query at the 0.04 floor; no true no-match on a
  fresh store. RUN-1 probe expected [] and failed; behavior is
  the discovery). PASS run-2. (OBS-127-3, P3 proposed.)
- KS3-search-no-query: {} -> ok=true, n=1 (ALL docs), score=1
  (required 'query' UNENFORCED at dispatch: String(undefined)->''
  matches every doc: +20 text +30 filename +2 recency = 52 ->
  1.0 — a missing required arg degrades to a FULL-STORE dump at
  MAX confidence; OBS-111-2 class). PASS both.
- KA1-add-positive: {note127.txt, marker content, [t127]} ->
  ok=true, uuid id, file has 2 docs, new doc carries
  filename/tags/createdAt (WRITE-HANDLER pin: read-modify-write
  whole file :42-60, contained in DATA_DIR). PASS both.
- KA2-search-finds-added: {query:'zephyr'} -> files=
  note127.txt,seed127.txt (round-trip; seed rides along via the
  KS2 recency floor — second corroboration). PASS both.
- KX1-cross-workspace-read: same query under a DIFFERENT
  workspaceId/userId -> SAME files (UNSCOPED-STORE pin: zero
  workspace/session/user partitioning — knowledge.ts has no
  workspaceId in any path; tenant A reads tenant B writes BY
  CONSTRUCTION). PASS both. (OBS-127-1 evidence.)
- KA3-add-missing-args: {} -> ok=true, docs=3, new doc
  filename='unknown.txt' content='' (required filename/content
  UNENFORCED; handler defaults :52-53 WRITE an empty-content doc
  — a no-op-looking call that MUTATES the global store;
  OBS-111-2 class. LIVE-CORROBORATED: live api/data/
  knowledge.json ALREADY contains unknown.txt empty docs from
  9/26 — a real missing-args add happened in production use).
  PASS both.
- KA4-add-medium-risk: ka1err=none ka3err=none (RISK pin:
  knowledge_add declares permissions+sideEffects ['write'] but
  matches NO classifyToolRisk carve-out -> default 'medium'
  (:202), allowed under default autoSafe with ZERO approval).
  PASS both. (OBS-127-1 evidence; cf 126-L1 broadcast-only info
  pin — this one DURABLE-writes.)
- KA5-add-swallowed-save: knowledge.json replaced by a DIRECTORY
  -> add STILL returns ok=true with an id; after restore docs=3,
  ghost absent (HONEST-WRITE pin: saveKnowledge throw is
  console.error-only :53-58; caller told ok:true with an id for
  a doc that exists NOWHERE). PASS both. (OBS-127-2, P1
  proposed.)
- Z0-containment: kbDocs=3 + <sbx>/data shape EXACT
  (db/users.json 2B + memory dir — contained import-graph side
  effect of cwd-default JSON stores, zero outside) + live api kb
  hash == pre (0F6483C1...) + worktree-root kb hash == pre
  (6D7A9D7E...) + zero 127 markers in either live store + live
  mem hash == pre (4F53CDA1...). PASS run-2 (RUN-1 probe wrongly
  expected absent stores and no <sbx>/data; corrected to
  exact-shape + pre-hash equality).

## Behavior pins carried (three new OBS, proposed backlog)
- OBS-127-1 (P2 proposed): knowledge_add is a write-declared
  tool at default MEDIUM risk (:202, no carve-out) reaching its
  handler with zero approval, durable-writing to a
  PROCESS-GLOBAL UNSCOPED store (no workspaceId anywhere), whose
  directory is created AS AN IMPORT SIDE EFFECT (mkdirSync at
  import :10-12). Three compounding facts, all live-pinned in
  ONE battery (KA4 + KX1 + P0/Z0). Repair direction
  (ownership-gated): carve knowledge_add to high (or gate writes
  behind explicit approval), scope the store per workspace (or
  document global-by-design + tenant warning), move mkdir to
  first-write. No edit without ownership.
- OBS-127-2 (P1 proposed): KnowledgeService.add swallows persist
  failure and reports ok:true with an id (KA5 live proof). Any
  downstream verifier/commit-receipt that trusts the tool ok is
  UNSOUND for this tool. Repair direction: return ok:false with
  the save error (or a persisted:false flag) when saveKnowledge
  throws. Smallest fix in the tree; still ownership-gated.
- OBS-127-3 (P3 proposed): recency +2 floor defeats no-match
  filtering — every recent doc matches every query at >=0.04
  (KS2 live proof, KA2/KX1 corroboration), and empty query
  returns the whole store at 1.0 (KS3). Repair direction: apply
  the score>0 filter BEFORE the recency boost (or require a
  token/phrase hit for inclusion). Relevance-only; no safety
  impact claimed.
- KS3 + KA3 join the known OBS-111-2 no-dispatch-validation
  class (required query/filename/content unenforced). No new OBS
  for the class. LIVE CORROBORATION for KA3: the live
  api/data/knowledge.json (938B, mtime 9/27, hash-verified
  untouched by this probe) contains unknown.txt empty-content
  docs dated 9/26 — the exact missing-args default shape,
  produced by real prior use, not by this audit.
- CWD-fragmentation (static + live-corroborated): store root is
  DATA_DIR || <cwd>/data, so different launch dirs = different
  stores. PROVEN BY PRE-EXISTING ARTIFACTS: worktree-root
  data/knowledge.json (311B, 9/26) and api/data/knowledge.json
  (938B, 9/27) coexist with different content; neither gained
  127 markers (hash-verified). A Joe run's knowledge is
  partitioned by accident of CWD. Info pin + evidence for
  OBS-127-1's scoping repair; no separate OBS.
- Description/contract mismatch (static note): knowledge_search
  advertises 'vector similarity' but search() is deterministic
  keyword scoring (phrase/token/tag weights + recency, /50
  norm). Behavior is fully pinnable and HAS been pinned; the
  wording misleads planner/tool-picker selection. No OBS without
  ownership (planner-visible text is NVIDIA-adjacent scope).
- <sbx>/data/{db/users.json 2B, memory/} is a contained
  import-graph side effect (cwd-default JSON store family:
  chat-store/form-inbox/page-store/session-log-store all
  default to <cwd>/data/db; exact creator of users.json
  un-attributed after a bounded search — setup.ts only
  comments on it). Exact shape pinned, zero outside the sbx.
  Info pin, no OBS. (110-126 did not assert on <sbx>/data, so
  no claim about their runs either way.)
- KA2/KX1 file ORDER (note127 first) reflects score sort
  (marker hit outranks recency floor) — sort comparator live-
  corroborated, info pin.

## Verdict
- THREE new OBS filed to the proposed backlog (127-1 P2 scoping/
  risk, 127-2 P1 dishonest-ok, 127-3 P3 precision); two more
  OBS-111-2 class instances noted (KS3/KA3), no new OBS for the
  class.
- ZERO new orphans (both families registered :213-214 AND live
  at dispatch; ORPHANED stays 5).
- Level-4 dispatch PROVEN for 88 tool-level families (86 prior
  + 2 new: knowledge_search full-handler incl. empty/positive/
  floor/max-confidence shapes + knowledge_add positive/default/
  failure-injection shapes with the gate-vs-handler split on
  EIGHT gate tools + the remote branch, and all four risk levels
  live-pinned). No repairs (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-127 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-126 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118/119/120/121/122/123/124/125/126; this checkpoint adds
  the 15-case run-2-green knowledge battery + store-root audit
  closure + three OBS; run-1 13/15 receipts preserved).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 127 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=88 tool-level (86 prior + 2 new in 127:
  knowledge_search + knowledge_add full-handler first live proofs
  via executeTool incl. read-only, positive, recency-floor,
  max-confidence-empty-query, contained-write, cross-workspace,
  missing-args-default and swallowed-save shapes; ai_write
  positive still unproven — needs a model call; delete_file
  handler still unproven behind the high gate; valid browser
  navigations/actions intentionally unproven; dead_code npx +
  archive shell paths intentionally unproven)
KNOWLEDGE_STORE_ROOT_LIVE=1 (DATA_DIR || <cwd>/data +
  knowledge.json; module-level import mkdir; DATA_DIR referenced
  ONLY by knowledge.ts; CWD-fragmentation live-corroborated by
  two coexisting pre-existing kb files)
UNSCOPED_STORE_LIVE=1 (KX1: different workspace reads identical
  docs; zero partitioning by construction; OBS-127-1 evidence)
HONEST_WRITE_GAP_LIVE=1 (KA5: ok:true + id for an unpersisted
  write; OBS-127-2 P1 proposed)
RECENCY_FLOOR_LIVE=1 (KS2: 0.04 floor on every recent doc;
  KS3: empty query dumps store at 1.0; KA2/KX1 corroboration;
  OBS-127-3 P3 proposed)
LIVE_MISSING_ARGS_CORROBORATION=1 (live api kb contains 9/26
  unknown.txt empty docs = KA3 default shape from real prior use)
ORPHANED=5 (tool-level lock UNCHANGED; helper-level dead code
  counted separately)
DEAD_HELPERS=8 (unchanged)
DEAD_REGISTERED_HANDLERS=2 (120 OBS-120-1 stands)
DUPLICATE=2 relationships (unchanged)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; 127 adds TWO more
  instances: KS3 search required-query, KA3 add
  required-filename/content)
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
  class (127: two coexisting kb files by launch dir)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pinned)
DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14+25+21+25+46+26+44+15
  (110+111+112+113+114+115+116+117+118+119+120+121+122+123+124+125+126+127
  run-2/final probes; 120 run-1 7/13 + 121 run-1 23/24 + 122 run-1
  18/21 + 123 run-1 19/23 + 125 run-1 16/26 + 127 run-1 13/15
  receipts preserved; 124 + 126 first-run green, no run-2)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(unprobed: recall_memory/memorize_codebase deep handlers :571-606
— NOTE NVIDIA ACTIVE claim on pipeline/memory/planner areas,
coordinate before probing there; ai_write_file POSITIVE path
when a provider is available; ProjectRun handler depth — same
NVIDIA note; dead_code npx + archive shell paths need owned
gateway review first) or the next Codex-requested bounded
scope, or OBS-114-1 / OBS-115-1 / OBS-116-1 / OBS-117-1 /
OBS-117-2 / OBS-118-1 / OBS-119-2 / OBS-120-1 / OBS-120-2 /
OBS-121-1 / OBS-121-2 / OBS-122-1 / OBS-123-1 / OBS-125-1 /
OBS-125-2 / OBS-126-1 / OBS-127-1 / OBS-127-2 / OBS-127-3
ownership/repair proposals at a coordinated checkpoint. No
registry/ToolService/tool edits without ownership.
