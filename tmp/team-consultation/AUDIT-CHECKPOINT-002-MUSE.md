# Muse deep-wiring audit checkpoint 2 — 2026-10-01 (MUSE_HEAD=c0c80b35)

Command: CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (TWO_AGENT_CONTINUITY).
Scope this checkpoint: per-goal planner visibility sampling (Muse tree).
Method: throwaway jest probe importing selectToolsFor/capabilityRoute
(removed after run); evidence tmp/joe-muse-cycle/planner-visibility.json.

## Runtime-proven results (Muse tree @ c0c80b35)
- REGISTERED_TOOLS=163 (re-confirmed by probe).
- 8 sampled goals (EN build/inspect/question/local-folder/terminal + AR
  inspect/translate/responsive): 5 hit the 30-tool cap, local-folder 18,
  terminal-error 16. Offered-set size is per-goal, not a static count.
- UNION_OFFERED=74/163 across 8 goals; SCORED_GT0=70; 9 core tools always
  present (central_answer, read_file, write_file, file_edit, delete_file,
  inspect_directory, search_files, search_text, shell_execute).
- capabilityRoute FIRES correctly: SEO->browser_seo_audit (16.1),
  AR broken-links->browser_check_links (26.7),
  AR responsive->browser_responsive_check (18.8).
- ROUTER_EXCLUDED negative control HOLDS: mobile_builder scores 17.9 on the
  responsive-inspect goal but is correctly NOT routed (builders excluded).
- HONEST-REFUSAL control HOLDS: AR translate goal (no URL, no session URL)
  returns route=null — required url unfilleable, so no dead-end call.
  Designed behavior, confirmed live.
- LOCAL-FOLDER demotion HOLDS: URL-required browser tools demoted
  (browser_page_fix 1.0); import_project #2 at 6.6.

## New finding for repair backlog (P2 candidate, NOT repaired this cycle)
- PLURAL-STEM GAP: goal 'Fix the failing tests in the shopcart folder'
  does not surface auto_tester/quality_run/test_generator (score 0):
  term 'tests' does not substring-match 'test' inside 'tester'/tags.
  scoreTool has no stemming; plural goal words miss singular tool names.
  Audit-only finding; repair (stemming/singularization) needs decision +
  owner + regression vs. desc-matching behavior. No source changed.

## Still UNKNOWN (explicit)
EXECUTABLE_TOOLS, FULLY_WIRED, PARTIALLY_WIRED, ORPHANED, DUPLICATE,
IMPLEMENTED_NOT_REGISTERED, CONTRACT_MISMATCHES — need registry to
ToolService to firewall to executor tracing. Next checkpoints. 89 tools
never offered in this 8-goal sample is SAMPLE COVERAGE, not an orphan
claim — many are niche or router-excluded by design.

## Related verification this cycle
- REWORK re-review: ACCEPT stands (fresh 40/40 rerun + 13/13 manifest).
- CRITICAL-REAL-JOE-UI-001 retest: still BLOCKED (env) — :5000/:5002
  stale-healthy (version=no-commit-file), :5101 down, backend refresh
  unanswered. No UI PASS claimed.
