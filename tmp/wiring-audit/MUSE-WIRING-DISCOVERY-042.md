# MUSE WIRING DISCOVERY 042 — S12 dormancy upheld + P3 production context traced

PROBES=tmp/wiring-audit/p4idle42.mjs (static text scan, zero Joe imports) +
  tmp/wiring-audit/callers42.mjs (generatePlan caller census)
FIXTURES=tmp/wiring-audit/fx-p4idle42/p4idle42_AB.json
HEAD_MUSE=8417f740 (muse/joe-development) MAIN=read-only NVIDIA worktree e8fd9589 (dirty preserved, untouched)
ENV=no servers, no network, no provider calls, no source edits anywhere
METHOD=full api/src text scan per tree (MUSE 1194 files, MAIN 1128) for
  tool-picker refs, picker-symbol refs, re-exports, and dynamic require/import
  shapes; hand-review of every hit; static call-chain trace of the planner
  context from run ingress to capabilityRoute.

## F31 S12/tool-picker DORMANT verdict UPHELD in both trees

Module: api/src/core/llm/tool-picker.ts (both trees). Exports:
  selectToolDefsForProvider, PRIORITY_TOOL_NAMES, MAX_PROVIDER_TOOLS.
- selectToolDefsForProvider: exactly ONE importer/caller per tree —
  system/scripts/verify_core_logic.ts:2 (import) + :40 (call). Tooling, not
  production runtime. The ckpt39 "only importer" claim re-verified at HEAD.
- PRIORITY_TOOL_NAMES / MAX_PROVIDER_TOOLS: referenced ONLY inside
  tool-picker.ts itself (:3,:5,:42,:44), both trees. No external consumer.
- Re-exports mentioning tool-picker: 0 in both trees.
- Dynamic require/import census: 9 production-shaped hits per tree, ALL
  cleared by hand: 4 are regex/string-literal false positives of the naive
  scan (app-blueprints:666, plan-tools:1714, scope-audit:287,
  AIGeneratorTool:50); ProjectRepairTool:35-41 loads packaged-app db.js/auth.js
  via require.resolve (project-scoped, recoverPackagedQaAuth); ProjectRunTool:994
  resolves package names under a project cwd (project-scoped); shared/ocr.ts:61
  locates a package dir. No dynamic load resolves to tool-picker, catalogue, or
  core/llm from production code (llm7 cache clears exist only in manual
  tests/manual/verify_blockers.ts).
- 3 "production" tool-picker text hits are COMMENT-ONLY prose
  (CentralAnswerTool:122, AgentOrchestrator:27 block comment, :702-703
  trailing comments) — verified by reading the lines.
VERDICT=S12_DORMANT_UPHELD both trees. The 15 S12-dormant-only names from
  ckpt39 stay dormant-by-evidence. Challenger recipe: show a production
  require/import/call of selectToolDefsForProvider the scan missed (file:line),
  or a runtime trace with the module in the loaded graph during a real run.

## F32 probe self-corrections (method honesty)

- C1: the first symbol pattern mixed tool-rerank.ts's catalogueForAsync /
  dynamicCatalogue (Muse-only P3-LLM layer, PlanningEngine:3244 local) with
  S12 symbols. They are a DIFFERENT module family; S12's entry is only
  selectToolDefsForProvider. Corrected before verdict; the 6 Muse-only
  symbol hits are P3-rerank internals, not S12 callers.
- C2: the probe's verdict field emitted CALLER_FOUND on comment-only hits.
  Manual line-level review overturns it to DORMANT_UPHELD. The JSON keeps raw
  hits; this memo is the reviewed verdict. A future probe revision should
  strip block comments and string literals before matching.

## F33 P3 production context traced end-to-end (static, both trees)

Call chain (identical shape both trees):
  AgentLoopService orchestrator.execute({..., context:{12 keys}})
    -> AgentOrchestrator.execute:274-279 this.context = {...goal.context, runId}
    -> plan() -> generatePlan(params, traceId, this.context)
      Muse :1818 await capabilityRouteAsync(goal, context)
      MAIN :1807 capabilityRoute(goal, context)   [sync only]
Production generatePlan callers: ONLY AgentOrchestrator:352 (initial) and
  :1174 (recovery), both passing this.context — full-tree caller census
  (callers42.mjs) shows every other caller is __tests__/tests/manual.
Canonical context keys (Muse AgentLoopService:785-800, MAIN :657-672,
  KEY-IDENTICAL): userId, userName, systemInstructions, sessionId,
  browserSessionId, workspaceId, resumeProjectRoot, modelConfig,
  memoryContext, language, isCancelled, cancellation. Plus runId added at
  AgentOrchestrator:278.
The fill gate reads (Muse toolCatalog:341-368, MAIN :276-303, SAME):
  context?.previewUrl || context?.url, context?.sessionId,
  context?.workspaceRoot.
FINDING: sessionId IS present, but previewUrl/url/workspaceRoot are ABSENT
  from the canonical production context in BOTH trees (workspaceId is an ID,
  not a path; resumeProjectRoot is a path the gate never reads). No
  enrichment of those keys exists inside generatePlan before the P3 call
  site (assignment grep empty; context passed through directly).
CONSEQUENCE: ckpt41's CTX1 scenario ({previewUrl,workspaceRoot} -> 9/46
  hand-routed) does NOT occur on the canonical path. Production P3 behaves
  like CTX0 for URL/path tools (0/46 hand-routed in the sweep) — the
  context gate honestly refuses what the runtime never supplies. Edit/session
  flows keyed on sessionId are unaffected.

## F34 repair leads (P-backlog, NOT this discovery lane)

- L1: thread a real previewUrl (or page URL) from browser-session state into
  goal.context for browser-capable runs; P3 URL tools stay unreachable
  without it.
- L2: map resumeProjectRoot -> workspaceRoot for resumed runs, or teach
  inputForTool to accept resumeProjectRoot as a projectpath source.
- SECURITY precondition for L1/L2: those keys feed path/URL argument fillers;
  untrusted goal/prompt text must NEVER become workspaceRoot/previewUrl
  (traversal/SSRF shape). Provenance must be runtime state only + negative
  tests. No repair attempted in this lane (read-only).

## Counts for the wiring matrix (static + structural, both trees)

S12_DORMANT_UPHELD=both | S12_PRODUCTION_CALLERS=0 | DYN_REQUIRE_PROD=9/tree
  (all cleared) | P3_CALLSITE=Muse:1818-async MAIN:1807-sync
  CANONICAL_CTX_KEYS=12+both-identical | CTX_HAS_SESSIONID=yes
  CTX_HAS_PREVIEWURL=no CTX_HAS_WORKSPACEROOT=no (both)
  PROD_GENERATEPLAN_CALLERS=2 (both in AgentOrchestrator, same context)

## Scope honesty / what is NOT proven here

- Static only. Runtime key-contents unproven from logs: preserved
  tmp/uat-critical-ui-run4/api-5101.log contains ZERO 'capability router'
  lines; recursive tmp grep for that marker in api-*.log is empty; no
  run-evidence.json exists under tmp. A live run emitting the :1820/:1809
  log line plus a one-time context-keys dump would close this (needs a live
  runtime window, not available this cycle).
- Single production goal-construction site found (AgentLoopService); a FULL
  run-ingress census (background/resume/worker/other entries that might build
  richer goal.context) is NOT done — open challenger item, do not over-claim.
- No S12 removal/registration recommended: dormant != dead; it is a provider
  function-calling path that may be intentional future/optional surface.
  Wiring-matrix row should read DORMANT_BY_EVIDENCE with this memo as proof.

NEXT (checkpoint 43): production run-ingress census (every site that builds
  an execute-goal or calls generatePlan outside tests) + first wiring-matrix
  rows for P3-routed tools annotated with REAL context levels (CTX-canonical
  vs CTX1-lab).
