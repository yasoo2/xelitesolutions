# WIRING-158 -- Database/enterprise-data wiring census, live-verified (Muse independent)

MUSE_HEAD=aad8d5e1 (tracked CLEAN, 0-line api/web delta; all 158 outputs new under tmp/wiring-158-database-chain/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T19:47Z (this cycle)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), run 2/2 EXIT 0 byte-identical result JSON (sha 62E61857...); definition/registry/dispatch/ledger/planner/executor files READ as text. ZERO DISPATCH: executeTool never called, no migrations run, no files written, no commands run, no network, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials). Bundle correction disclosed below; bundle deleted after runs, entry + logs + results preserved.

## TRIGGER
Shared repair backlog BATCH-P1-004 claims only db_schema_migrator is planner-visible
while query_optimizer + large_data_seeder are revived-but-invisible, and the shared
summary bins ~50 tools as INTERNAL_ONLY without per-chain evidence. Wiring-158
live-adjudicates the database chain on Muse HEAD and confirms the NVIDIA tree
carries the identical chain (read-only source check).

## LIVE CENSUS (Muse HEAD; bundle-run1.result.json == bundle-run2.result.json byte-identical)
- registered=163; chain 3/3 registered (db_schema_migrator, large_data_seeder, query_optimizer); adjacent query_datasource registered; all 4 hasExecute=true
- 3/3 chain names in DatabaseEnterpriseTools.ts are registered live -> IMPLEMENTED_NOT_REGISTERED=0 HOLDS for this family
- TOOL_ALIASES db hits: 0 (no db aliases)
- PLANNER_TOOL_CATALOGUE db hits: 1/3 (only db_schema_migrator) -> BATCH-P1-004 premise CORROBORATED live
- isVerificationTool unconditional-true: 0/4 (all false)
- resolvePlannedTool live, 8 phrases: 2 meaning-green to db_schema_migrator ('run the database migration for the backend', 'migrate the SQLite database with schema.sql'); 3 exact-green (all 3 chain names); 2 MISROUTES ('optimize this slow SQL query'->db_schema_migrator via meaning, 'generate a large CSV seed file for stress testing'->auto_tester via meaning); 1 UNKNOWN ('create a million-row test dataset')
- gateShapes, 7/7 false: migrate-status, migrate-push, optimize-valid, optimize-empty, seed-valid, seed-empty, seed-outside
- Registry log live: "Registered 163 tools (71 revived)"; 21 permission defaults corroborated again (no chain tool among them -- all 3 declare permissions)
- registryDatabaseEnterpriseRefs: 1 (import line; registration is via 3 named class imports + revived spread -- all 3 proven registered live)
- mockSupported=false for all 3 chain tools + adjacent (database planning unavailable in mock/offline mode)

## SOURCE READS (both lines; DatabaseEnterpriseTools.ts byte-identical 0F40F9E7, 299 lines)
- DbSchemaMigratorTool: REAL executor. SQLite via node:sqlite (dynamic require with truthful capability error on old runtimes) + Prisma via npx handleShellCommand; .sql schema auto-routes engine sqlite even under a stale prisma default; schema discovery bounded (depth 6, 50 files, skips node_modules/.git/dist/build); schemaPath + databasePath contained via resolveToolPath with caller workspaceId; reset deletes only the resolved database file. permissions [execute,read], sideEffects [execute].
- QueryOptimizerTool: HEURISTIC STATIC ANALYSIS ONLY. Description promises "using EXPLAIN ANALYZE" and inputSchema accepts dbUri, but execute() never connects: it uppercases the SQL and appends string-match suggestions (WHERE/SELECT */LIKE/OR/LIMIT). dbUri is accepted and IGNORED. permissions ['internet'] but zero network use. The OUTPUT text is honest ('Heuristic Static Analysis (Connect DB for true EXPLAIN)'), so runtime consumers see truth -- but planner/dispatch layers select on the description. Contract-honesty gap, not a live outage.
- LargeDataSeederTool: REAL contained writer. resolveToolPath sandbox:true (escape refused with a sentence; comment documents the proven pre-fix escape + TypeError fix); rows clamped 1..1_000_000; headers default [id,name]; missing outputPath earns a sentence instead of a crash. NOTE: execute(input) takes NO context, so resolveToolPath runs WITHOUT caller workspaceId (default active root). Escape-proof (containment enforced) but workspace-attribution is default-root, not caller-root -- a multi-user/portability note, not a live escape. permissions [write], sideEffects [write].
- plan-tools.ts db surface: 6 refs, ALL db_schema_migrator (catalogue entry + meaning keys postgres/postgresql/mysql/mongodb/mongoose/prisma/sqlite/database/sql + an argument validator demanding action with an Arabic error). ZERO query_optimizer/large_data_seeder/query_datasource planner vocabulary -- this is WHY the optimizer's core intent ('optimize this slow SQL query' contains 'sql'->migrator) and the seeder's natural phrases ('testing'->auto_tester) misroute.
- ToolService.ts db refs: EMPTY -- no shadow/interception (clean, like the self-coding chain in wiring-157; unlike the memory chain in wiring-156). ToolService.ts itself is byte-identical on BOTH lines (F8608F51), so this holds for NVIDIA too by file identity.
- PhaseExecutorTool.ts db refs: 0=0 on BOTH lines -- no db-NAMED handling. No exemption is needed: the migrator contains its own paths (resolveToolPath + workspaceId), the generic RUNTIME_ARTIFACT_SOURCE_KEYS already include schemaPath/databasePath (per wiring-157 source read), and the seeder contains outputPath inside the tool. Gate-false 7/7 is CORRECT-BY-DESIGN: verifiers must not migrate/seed (mutation is not a check), and the optimizer cannot truly verify performance (heuristic-only). No UI-001-class gap here.
- NVIDIA compare (read-only): DatabaseEnterpriseTools.ts byte-identical (0F40F9E7); registry db lines 4=4 (import + 3 safeNew); plan-tools db lines 6/6 same substance (catalogue + meaning keys + validator; line numbers shifted by NVIDIA's unrelated dirty edits); executor 0=0; ToolService file-identical. The chain is identical on BOTH lines.

## CLASSIFICATION (Muse independent position)
- db_schema_migrator: FULLY_WIRED at Levels 2-4 (registered + executable + catalogued + meaning-routed + argument-validated + contained + gate-correct). Strongest single-tool chain audited so far. Level-6 Real UI remains UNVERIFIED (consistent with OBS-150-2).
- query_optimizer: PARTIALLY_WIRED (registered + executable + exact-dispatchable, BUT 0 planner vocabulary + core intent misroutes to the migrator + description/permission over-claim vs heuristic behavior).
- large_data_seeder: PARTIALLY_WIRED (registered + executable + exact-dispatchable + contained + capped, BUT 0 planner vocabulary + natural phrases misroute to auto_tester/unknown).
- query_datasource (adjacent, DatasourceTool file): PARTIALLY_WIRED (registered + executable, 0 planner-visible); needs its own chain audit for full classification -- recorded here only as adjacency, not a verdict.

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-158-1 (P2): query_optimizer contract honesty + vocab AFTER honesty. Owner must either (a) implement connection-aware analysis (bounded: SQLite EXPLAIN QUERY PLAN via node:sqlite, no credentials, no network) or (b) correct description to heuristic-static + drop the unused internet permission + mark dbUri ignored-or-remove + pin the honest output. Add planner MEANS keys ('optimize', 'slow query', 'index') ONLY after the honesty fix -- routing more traffic to an over-claimed tool first would be a regression. Evidence: source lines 181-222, markers (EXPLAIN ANALYZE 1 in description vs Heuristic 1 in output, internet-permission 1 with 0 network calls), live misroute 1/8.
- OBS-158-2 (P3): large_data_seeder planner-intent gap. Add MEANS/catalogue entries ('seed file', 'stress test data', 'test dataset', 'generate CSV/seed') + negative pins (seeder never selected for behavioral verification; auto_tester keeps 'testing' behaviors). Evidence: live 2/8 misroutes (auto_tester + unknown), 0 planner refs.
- OBS-158-3 (P4): dataset vocabulary + seeder context-threading + Arabic-route pins. (a) 'create a million-row test dataset' UNKNOWN -- cover with the OBS-158-2 vocabulary; (b) thread context through LargeDataSeederTool.execute so resolveToolPath receives caller workspaceId (default-root works today; caller-root is required for multi-user portability); (c) pin Arabic db routes when planner vocab work lands (validator message is Arabic but no Arabic routing evidence exists). Depends on BATCH-P0-001; no behavior risk.
- BATCH note: database chain now has live Level-2/3 evidence (3 registered, 1 catalogued, 0 aliases, 0 unconditional + 7 gate-shape pins, 8/8 resolutions incl. 3 exact + 2 meaning-green + 2 misroutes + 1 unknown, 3/3 hasExecute, containment proven by source read on both lines); Level-6 remains UNVERIFIED -- consistent with OBS-150-2.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git diff --numstat empty) -> prior greens still apply to identical source: smoke-verification-rewrite 5/5 + prose 14/14 (see feas-bw lineage). No jest rerun this cycle (bundle pattern used; no wedge hidden).
- Zero contract deaths in all preserved runs (run4b/run22 lineage); Gap-A/B negative integration tests remain NVIDIA/Codex-owned follow-ups, still unimplemented (NVIDIA owns ledger/planner scope, actively dirty, worker live).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + live resolution + gate-shape pins + source reads); no db tool executed, no migrations run, no files written, no UAT (provider-blocked, see feas-bw).
- Bundle correction disclosed: first bundle attempt EXIT 1 (playwright-core chromium-bidi unresolvable + ssh2 .node loader under full bundling). Rebundled with --packages=external + NODE_PATH=api/node_modules -> 2/2 EXIT 0 byte-identical (62E61857...). Registry/tools/catalogue/resolver/ledger behavior identical (same live requires, same 163/71 log line); no result invented from the failed attempt.
- run1/run2 .log files differ only in volatile importMs; RESULT JSON pair is byte-identical (62E61857...).
- NVIDIA tree touched READ-ONLY (hashes + greps, 0 writes). HEAD e8fd9589, 16 tracked-dirty + untracked (planning/registry/ledger/pipeline scope), worker parent 12736 + opencode child 19364 live; untouched.
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
