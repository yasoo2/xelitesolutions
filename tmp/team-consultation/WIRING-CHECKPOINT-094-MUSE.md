# WIRING CHECKPOINT 094 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=8befcd70 (exact; tracked clean; api/src + web/src identical to
f88b8d58 — intervening commits docs/evidence only)

## Scope: database-enterprise family (db_schema_migrator action gate + siblings)
094 traces `db_schema_migrator`, `query_optimizer`, `large_data_seeder` across
offer -> plan-cleaning -> dispatch -> target. Method: source reads only
(registry, PRIORITY, catalogue, keyword map, planner artifact set, action
gate, dispatch renames, target contracts + execute heads, in-repo caller
search, lock tests). No tool executed, no network, no source edited. Evidence:
this file + cited lines (all paths api/src/... in this worktree).

## Result
1. REGISTERED: all three (registry.ts:168 db_schema_migrator;
   DatabaseEnterpriseTools.ts:107/182/225 names; QueryOptimizer +
   LargeDataSeeder imports registry.ts:83).
2. OFFER — db_schema_migrator FULLY OFFERED: PRIORITY list
   (core/llm/tool-picker.ts:16), PLANNER_TOOL_CATALOGUE with a strict
   purpose (plan-tools.ts:106: action REQUIRED, exactly migrate/push/reset/
   status; engine sqlite for .sql, prisma only for .prisma; does not design
   schemas), keyword map (postgres/mysql/mongodb/mongoose/prisma/sqlite/
   database/sql -> db_schema_migrator, :141-143), planner implementation-
   artifact set (ProjectPlannerTool.ts:1534).
3. OFFER — siblings UNOFFERED: zero matches for query_optimizer /
   large_data_seeder in plan-tools.ts (no catalogue, no keywords, no gate)
   and none in PRIORITY. Reachable only via provider scoring (tags:
   optimizer ['database','performance'] :185; seeder ['database','testing',
   'data'] :228). Scoring-reachability PROVEN for seeder: it appears in a
   scored tool list in a-door-closed-is-not-a-wall.test.ts:95.
4. PLAN-CLEANING: action gate (plan-tools.ts:1358-1364) rejects any
   db_schema_migrator task whose action is not exactly migrate/push/reset/
   status with a planner-facing message. No sibling gates exist (unoffered).
5. DISPATCH: direct executeTool('db_schema_migrator') has NO rename-if
   (verified: no db/query/large alternatives in ToolService dispatch or
   rate-limit branches) — name reaches the registry verbatim.
6. TARGET db_schema_migrator (DatabaseEnterpriseTools.ts:106-179): REAL.
   sqlite path uses node:sqlite with dynamic require + truthful capability
   error on old nodes (:63-73); honest empty-file (:84), unsupported-action
   (:91/:169) and failure (:102) errors; structured output
   (output/databasePath/schemaPath/engine/action :95). Discovery rooted at
   workspace resolveToolPath (:32), depth<=6, <=50 candidates, skips
   node_modules/.git/dist/build (:38-48); explicit databasePath/dbPath goes
   through resolveToolPath (:21); default nexus.db under the package root
   derived from the discovered schema file (:26). reset DELETES the db file
   (:78) — destructive but workspace-contained and action-gated (OBS-094-4).
7. TARGET query_optimizer (:181-221): STUB BEHIND A REAL CONTRACT
   (F-094-1, SIGNIFICANT). Description promises "EXPLAIN ANALYZE" but
   execute() is pure static heuristics, never connects anywhere (:198-221);
   dbUri accepted but IGNORED; output labels itself 'Heuristic Static
   Analysis' honestly but the tool description does not. Declares
   permissions ['internet'] "Needs network to DB" (:195) with ZERO network
   use (F-094-2: permission over-claim). Dead LIKE check :209 compares
   against the literal string 'LIKE \'%_wildcard_%' which no real SQL
   contains (F-094-3, minor).
8. TARGET large_data_seeder (:224-275+): REAL + REPAIRED. Containment via
   resolveToolPath sandbox:true with honest refusal (:263-266); honest
   missing-outputPath error (:251-254); rows capped 1..1M (:258). The
   write-tools-contract.test.ts header (:24-25) documents the ORIGINAL
   escape (raw fs.writeFileSync outside workspace + TypeError crash) as
   found-and-fixed audit evidence. Declares write/write (:240-241) —
   accurate.
9. CALLERS: exactly one non-test in-repo reference outside
   registry/catalogue/picker/definitions: the planner artifact set (:1534
   above). Zero direct executeTool('db_*'/'query_*'/'large_*') callers found
   (bounded search; dynamic-plan emission is the intended path).
10. LOCK TESTS: db_schema_migrator pinned in plan-tools.test.ts
    (:38,:274-281,:353-357 — gate/cleaning), the-planner-asks-the-tools
    (:49), wiring-policy.test.ts:551 (Arabic goal reaches the specialist
    via scoring), verify_tool_reach.ts:40. Seeder referenced in
    write-tools-contract (escape audit) + door-closed (:95, scoring list).
    Optimizer: NO dedicated test reference found (consistent with stub
    status — nothing pins its heuristic output).

## Verdict
- db_schema_migrator: FULLY_WIRED (registered, priority+catalogue+keyword
  offered, planner-recognised, action-gated, direct dispatch, real
  contained implementation, honest errors, pinned).
- query_optimizer: PARTIALLY_WIRED + CONTRACT_MISMATCH (F-094-1/F-094-2):
  registered and scoring-reachable, but description/permission promise a
  live EXPLAIN ANALYZE the implementation never performs. Not an orphaned
  tool — a misdescribed stub.
- large_data_seeder: PARTIALLY_WIRED (registered, scoring-reachable, real
  repaired implementation) — unoffered by design or oversight is UNDECIDED;
  no evidence the planner can select it except via scoring tags.
- F-094-1 (new, SIGNIFICANT, not repaired): optimizer description vs
  implementation mismatch. Recommended direction (coordinated ownership):
  either implement the documented EXPLAIN path or rewrite the description
  to "static SQL heuristics" + drop the ignored dbUri + pin the heuristic
  outputs. Do NOT leave a stub advertised as live analysis.
- F-094-2 (new, SIGNIFICANT, not repaired): optimizer permissions
  ['internet'] with zero network use. Recommended direction: correct to
  the honest permission (likely []/read) when F-094-1 is decided.
- F-094-3 (new, minor, not repaired): dead LIKE-wildcard check :209.
  Recommended direction: fix to a real leading-wildcard test or delete.
- OBS-094-4: migrator `reset` deletes nexus.db — by design, contained,
  action-gated; no change without ownership. OBS-094-5: seeder/optimizer
  unoffered status undecided — backlog question, not a defect claim.
- Recommended direction (backlog, coordinated ownership): resolve F-094-1
  description-vs-stub + F-094-2 permission + F-094-3 dead check + decide
  sibling offer status + pin optimizer outputs. No registry/picker/
  plan-tools/DatabaseEnterpriseTools edits without coordinated ownership.
- Observed for future checkpoints (not 094 scope): prisma-path shell
  construction (handleShellCommand), github_pr wiring (carried from 093),
  fullpage_shot/extract_meta empty-url behavior. One family per checkpoint.

## Locks carried (not rerun: api/ registry/picker/ToolService/plan-tools/
## ProjectPlannerTool/DatabaseEnterpriseTools unchanged since 086; HEAD moved
## only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086: 57 offered / 38 resolved / 19 gaps / 28 aliases 0-broken.
- 087: image chain mapped, STALE_OR_FUTURE, residual hazard open.
- 088: github chain coherent, F-088-1 open.
- 089: read_file_tree mapped, F-089-1 open.
- 090: grep family FULLY_WIRED at dispatch, F-090-1 + F-090-2obs open.
- 091: browser_run FULLY_WIRED, web_search fork F-091-1, F-091-2/F-091-3,
  OBS-091-4 open.
- 092: git_ops FULLY_WIRED, F-092-1/F-092-2/F-092-3, OBS-092-4/OBS-092-5 open.
- 093: browser_launch FULLY_WIRED, NEEDS_BUILT_URL 3/4 dead, F-093-1/F-093-2/
  F-093-3, OBS-093-4/OBS-093-5 open.
- 084 P4 + F-086-1 + F-088-1 + F-089-1 + F-090-1 + F-090-2obs + F-091-1 +
  F-091-2 + F-091-3 + OBS-091-4 + F-092-1 + F-092-2 + F-092-3 + OBS-092-4 +
  OBS-092-5 + F-093-1 + F-093-2 + F-093-3 + OBS-093-4 + OBS-093-5 + F-094-1
  + F-094-2 + F-094-3 + OBS-094-4 + OBS-094-5 await team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=7/19 (db family newly mapped)
CLEANING_TRACE=db action gate mapped (4-action membership enforced)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
github_pr wiring, or prisma-path shell construction, or the fullpage_shot/
extract_meta empty-url behavior, or the next Codex-requested bounded scope.
No picker/registry/ToolService edits without ownership.
