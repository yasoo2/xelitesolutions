# MUSE wiring discovery checkpoint 051 (2026-10-01, HEAD cb227faa)

Scope: executed registry-vs-catalogue reconciliation (read-only probe, real imports).
No source edits. Probe: tmp/wiring-audit/revived51.ts, output fx-revived51/revived51.json.

## 1. Exact counts (executed, same process — self-consistent)

- REGISTERED_TOOLS = 163 (probe) — matches live run33 boot line
  "Registered 163 tools (71 revived)" and the probe's own boot line.
- PLANNER_TOOL_CATALOGUE = 40 entries (probe) — hand-recount confirms 40.
  Supersedes JOE-WIRING-AUDIT-SUMMARY "~51 entries" (stale).
- safeNew literal labels = 70; +1 direct object (TodoWriteTool, registry.ts:224)
  = 71 revived. Matches boot line. (Checkpoint 050's "71 safeNew" refined:
  70 safeNew + 1 direct.)
- catalogueNotRegistered = [] — zero dangling catalogue entries (stronger than
  the existing plan-tools test, which asserts the same on the same tree).
- registeredNotCatalogue = 123 (163-40, exact list in fx-revived51/revived51.json).
  Supersedes summary "~20" (basis unclear; likely an older catalogue size).
- revivedNotCatalogue = 53; revivedInCatalogue = 17 (project_detect,
  auth_builder, mobile_builder, swagger_docs, i18n_translator,
  scaffold_full_stack, db_schema_migrator, git_ops, github_repo_manager,
  github_pr, deploy_project, dependency_audit, quality_run, test_generator,
  inspect_directory, search_text, payments_create_checkout_session).
  Revived ≠ unplannable: 17 revived tools ARE prompt-listed.

## 2. Enforcement finding (source read, plan-tools.ts)

- resolvePlannedTool (:228) line 232: `if (registered().has(name)) return
  { tool: name, how: 'exact' }` — resolves ANY registered tool.
- The catalogue is prompt guidance only (plannerToolPrompt :1697 says "the ONLY
  values allowed" — prompt wording, NOT code enforcement).
- Correct refined terms:
  - REGISTERED_NOT_PLANNER_PROMPT_LISTED = 123 (exact, proven).
  - Hard REGISTERED_NOT_PLANNER_RESOLVABLE = 0 for registered tools
    (resolver accepts all registered names + aliases + MEANS/NOT_SOFTWARE).
- Design intent is explicit (plan-tools.ts:71-76): "Deliberately a SHORT list,
  not all 151 registered tools ... a wall of names buys worse plans."
  The 123 unlisted tools are reachable when the model names them unprompted;
  per-tool BY_DESIGN vs GAP judgment remains future work (needs usage evidence,
  not just counts).

## 3. Label/name drift found (registry.ts:158-159 vs WebDevelopmentTools.ts:34-35,435)

- safeNew labels 'web_pipeline' / 'dev_server' do NOT match the constructed
  tools' real names 'website_full_pipeline' / 'dev_server_start'.
- Labels are only used in skip warnings (harmless), but the 53/17 revived
  split above is label-based: 68/70 labels match registered names exactly.
  Headline 163/40/123 counts are name-exact and unaffected.
- Repair-backlog candidate (label correction); discovery lane is read-only.

## 3b. Doc drift flagged (not fixed — discovery lane is read-only)

- plan-tools.ts:73 comment "not all 151 registered tools" is stale (163 now).
  Trivial doc repair-backlog candidate; needs an implementation owner.

## 4. Method / reproducibility

- `cd api && OFFLINE_MODE=true JOE_TEST_MODE=true NODE_ENV=test
  JWT_SECRET=<test-only-ephemeral> npx ts-node -P tsconfig.json
  --transpile-only ../tmp/wiring-audit/revived51.ts` — EXIT 0.
- Must use `-P tsconfig.json`: entry outside api/ otherwise picks the root
  NodeNext tsconfig (TS5109). JWT fixture required by shared/config.ts
  (same established pattern as AGENTS gates; ephemeral, not persisted).
- No tool executed, no network, no writes outside fx-revived51.

## 5. Disposition vs audit summary

- REGISTERED_TOOLS 164→163: Muse tree has 163 (main has 164 per /api/tools;
  delta = SpecificationVerificationTool present in main, absent Muse — see
  checkpoint 045 ENTRY-B MAIN+1; consistent, not a new finding).
- OBSOLETE_REGISTRATION stays UNKNOWN (dormant-priority-16 list still not
  located in shared state — artifacts TOOL-PRIORITY-DYNAMIC-20260929.md /
  probe-dormant-tool-priority.mts not found at team root; next step: locate
  or regenerate from main).
- EXECUTABLE_NOT_VERIFIABLE stays 5+ estimate (per-tool verification-contract
  survey still open).
