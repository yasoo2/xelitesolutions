# Muse cycle note — standing re-confirm + registry/catalogue static reconciliation (Muse bytes)
AGENT=MUSE
NOTE_ID=CYCLE-1355Z-REG-CATALOGUE-RECONCILE
UPDATED=2026-10-04T13:55Z
MUSE_HEAD=0f6e97385b3b4e0e4c0f7e6b9d0f2e6f2e6f2e6f (see git log at commit; tracked tree CLEAN at cycle start)
MUSE_TRACKED_TREE=CLEAN (only pre-existing untracked scratch; nothing deleted)
NVIDIA_HEAD=f40f6100e8083bfefeef54eb7812c3690b068048 (unchanged, no new commit)
SHARED_FILE_WRITE=TO_BE_PROBED_THIS_CYCLE (prior cycles: ACCESS_DENIED; this file stands for verbatim import)

## Standing confirmation (read-only, runtime untouched)
- f40 3 files unmodified in NVIDIA working tree (git status on the 3 paths: empty).
- F1 matcher text CONFIRMED still present in working bytes:
  app-blueprints.ts:3233 bare `utility|script|tool` (+ `utility\s+script`) alternatives
  inside isCliRequest. File NOT in dirty list, so committed == working for the
  matcher. F1 REMAINS OPEN. Prior 19/19 + engineer-flow + 5-flip evidence transfers exactly.
- NVIDIA dirty list identical: same 17 tracked files (incl. IntentParser/
  PlanningEngine/plan-tools/registry/pipeline/bulk/image/visual/UI-inspection).
  17 files changed, 1679+/110-.
- Browser-contract guard status carried from 13:45Z note (UNREPAIRED in dirty WIP,
  no shared helper); guards NOT re-diffed this cycle to avoid duplicate reads.
- Health OBSERVED (not acceptance): :5000 and :5002 /api/health both status OK,
  LOCAL, singleUser false, version no-commit-file, uptime ~6270s at 13:53:33Z.
  No prompt submitted, no UI driven, no process touched, no test executed
  (owner verification may be running; zero contention by design).
- No reviewable repair candidate exists. No competing Muse implementation written.
- Pending-consultation sweep: NO consultation addressed to MUSE awaits a first
  response. All Muse reviews stand (f40 APPROVE_WITH_CHANGES; browser-contract
  NEEDS_EVIDENCE; lifecycle-hang/rework reviewed). Re-reviews gated on owner
  bytes that do not exist yet.

## NEW audit slice — REGISTERED vs PLANNER_VISIBLE on Muse HEAD bytes (static, exact)
Scope: D:/Joe/muse-worktree api/src at HEAD 0f6e9738. Method: static
read-only source reconciliation (grep + file reads). No registry load, no jest,
no runtime. NVIDIA bytes spot-checked read-only where noted.

### R1. REGISTERED ceiling = 163 (static reconstruction, corroborates prior runtime 163)
registry.ts composition (api/src/modules/tools/registry.ts):
- plain `new X()` entries: 55 (32 browser/user + 5 repo-self-coding + 5
  discovery/capability/api-discovery + 13 system/terminal)
- `new EliteTools.X()`: 8 (DependencyGraph..SelfConfidence)
- `createTool(...)` calls: 26 (27 grep hits minus 1 function definition line)
- `...MemoryTools`: 2 (recall_memory, memorize_codebase — MemoryTool.ts:21,60)
- `ArchitectTool` object: 1
- `...revivedTools`: 70 safeNew labels + 1 TodoWriteTool object = 71 max
- STATIC MAX = 55+8+26+2+1+71 = 163
Caveats (explicit): safeNew returns null for broken tools at runtime; nameless
createTool fallbacks are skipped (`if (!name) continue`); either would LOWER
the live count. Runtime load not repeated this cycle (prior runtime evidence:
163). Duplicate-name entries throw at startup (fail-loud, registry.ts:405).

### R2. IMPLEMENTED_NOT_REGISTERED = 4 on Muse bytes (static, file:line pinned)
Imported in registry.ts:14-18 but with ZERO registration references anywhere
in registry.ts:
- VisualQATool (:14), ImageGenerationTool (:15), CodebaseNavigatorTool (:16),
  BulkFileGeneratorTool (:18)
Note: CodebaseOutlineTool IS registered (revived `codebase_outline`) while
CodebaseNavigatorTool is not — consistent with Codex 2026-10-03 correction.
3 of 4 (visual_qa, generate_image, bulk_file_generator) are already covered by
NVIDIA dirty BATCH011 work; navigator revival pending ownership/safety review.
NO Muse action (owned lanes; audit-first).

### R3. PLANNER_VISIBLE mechanism (Muse bytes; NVIDIA bytes spot-confirmed same lineage)
- Hardcoded 7-tool prompt line is GONE from planner prompts. Only remaining
  occurrence of "Use ONLY existing tools" is the historical comment in
  toolCatalog.ts:6. No grep_search/npm_manager/browser_run co-occurrence in
  PlanningEngine.ts or ProjectPlannerTool.ts.
- Live prompt (PlanningEngine.ts:3244-3253): `catalogueForAsync(intent.goal)`
  with sync fallback, interpolated as "Use ONLY tools from THIS catalogue ...
  If nothing in the catalogue fits, use central_answer(question) — never
  invent a tool name."
- Per-goal catalogue (toolCatalog.ts:186-225): CORE_TOOLS 9 always offered
  (central_answer, read_file, write_file, file_edit, delete_file,
  inspect_directory, search_files, search_text, shell_execute) + scored
  positives, cap 30 total per goal (limit=30).
- capabilityRoute single-shot specialist routing (toolCatalog.ts:405+) with
  ROUTER_EXCLUDED = 38 names (:317-329) never routed.
- Planner answers validated against full registry: registeredToolNames() set
  at PlanningEngine.ts:3442 (NVIDIA bytes: :3472, same shape).
- Second consumer: adaptive-dag-planner.ts:363 `${catalogueFor(intent.goal)}`.
- Pinned by: wiring-policy.test.ts (~523-611), tool-selection-rerank.test.ts,
  local-project-routing.test.ts, capability-decision-tool.test.ts.
- AUDIT CHARACTERIZATION: PLANNER_VISIBLE is per-goal dynamic (<=30 of ~163
  per goal). Any single "planner-visible count" is corpus-bound by nature, not
  a registry property. Corpus-miss leads (e.g. "40 catalogue gap" family) must
  be read as retrieval leads, never as orphan proofs (cf. cycle225 correction).

### R4. Minor shared prompt-hygiene defect (BOTH lineages — recorded, NOT repaired)
- PlanningEngine.ts:3255 (Muse) / :3287 (NVIDIA) DATA FLOW example teaches
  `"tool":"link_checker"`, but `link_checker` is registered NOWHERE and aliased
  NOWHERE (repo-wide search: single occurrence = that example line).
  Registered name is `browser_check_links` (BrowserSmartTools.ts:235).
- The same prompt (:3253) instructs "never invent a tool name" — the example
  contradicts the instruction. A literal-following model emits a name the
  :3442 validation then rejects.
- Owner: NVIDIA (PlanningEngine dirty lane). Muse writes NO competing edit.
  Suggested fold-in: `link_checker` -> `browser_check_links` in the example,
  or add an alias + pin. Filed for owner/backlog.
- Related doc hygiene (no action): toolCatalog.ts header comment still says
  "Joe registers 151 tools ... 26 of 151" (stale vs current 163 ceiling).

## Position / recommendation (reviewer + audit lane, no overlap)
- POSITION: prior f40 APPROVE_WITH_CHANGES and browser-contract NEEDS_EVIDENCE
  both STAND unchanged. This slice adds R1-R4 as audit evidence only.
- RECOMMENDATION: NO_NEW_IMPLEMENTATION_BY_MUSE. Owner (NVIDIA) continues
  bounded browser-contract + F1 repairs; Muse re-reviews exact fixed bytes;
  Codex owns source-bound loading + official5002 UAT replay. R4 folds into
  owner PlanningEngine work or the wiring repair backlog.
- Overlap: none. Zero Muse source edits this cycle; NVIDIA
  IntentParser/PlanningEngine/pipeline/registry lane untouched by Muse.

## Evidence paths (all read-only; quotes above are short excerpts)
- api/src/modules/tools/registry.ts (399+24 lines; imports :14-18; revived
  :138-225; base :227-340; dedupe/contract :399-422)
- api/src/core/orchestrator/toolCatalog.ts (405+ lines; CORE_TOOLS :119-122;
  selectToolsFor :186-220; ROUTER_EXCLUDED :317-329; capabilityRoute :405+)
- api/src/core/orchestrator/PlanningEngine.ts (:3244-3264 prompt; :3442 validation)
- api/src/core/orchestrator/adaptive-dag-planner.ts (:363 consumer)
- api/src/core/orchestrator/tool-rerank.ts (:243-244, :319-320, :329-335 async wrappers)
- api/src/modules/tools/definitions/BrowserSmartTools.ts (:234-235 registered name)
- api/src/modules/tools/definitions/MemoryTool.ts (:19-60, 2 tools)
- NVIDIA read-only: app-blueprints.ts:3231-3248, PlanningEngine.ts:3283-3287/:3472
- Health: curl :5000/:5002 /api/health 13:53:33Z (OK/LOCAL/no-commit-file)
- Muse tree: HEAD 0f6e9738, tracked clean (git -c safe.directory=... status)
