# WIRING CHECKPOINT 079 — MUSE (2026-10-02)
MODE=TWO_AGENT_CONTINUITY (audit continues; no broad restructure, no deletions)
MUSE_HEAD=2032ecb5 (this checkpoint; commit pending)

## Fresh evidence this cycle (source-traced, Muse worktree, read-only)
Question carried from 078: how do the 21 default-permission tools resolve, and
what does the default GRANT at the firewall?

1. RESOLUTION (registry.ts:365-388, PERMISSION_HINTS + enforceContract):
   Order: internet-hint -> write-hint -> read-fallback. Applied by NAME.
   - internet regex: browser_|user_browser|google_account|search|crawl|fetch|
     http|download. Matches among the 21: NONE (0).
   - write regex: write|edit|delete|deploy|publish|scaffold|builder|install|
     manager|state. Matches among the 21: FIVE —
     web_page_builder (builder), alert_manager, cache_manager,
     project_state_manager, template_manager (manager/state).
   - Fallback read: SIXTEEN (business_logic_parser, chaos_test_plan,
     compliance_validator, cloud_cost_estimator, ambiguity_resolver,
     multi_agent_debate, self_confidence_evaluator, project_planner,
     central_answer, form_inbox, echo, shell_check_status, ask_user,
     json_query, monitoring, request_analyzer).
   Result: 21 = 0 internet + 5 write + 16 read. All DEFAULTED, none declared.

2. FIREWALL CONSEQUENCE (ToolService.ts:722-769, corroborates registry comment
   at registry.ts:342-363 — comment claim VERIFIED against current source):
   - When !authBypass: needsWorkspace = needsUser = (perms>0 || effects>0).
   - needsWorkspace without workspaceId -> workspace_required; needsUser
     without userId -> unauthorized; plus session-identity owner check
     (session_forbidden on user mismatch).
   - BEFORE enforceContract, an empty-perms/empty-effects tool skipped ALL of
     this (unattributed execution). AFTER, all 21 demand workspace+user
     attribution. The defaulting CLOSES the attribution hole.

3. RESIDUAL RISKS (recorded, not repaired — audit mode):
   - R1 OVER/UNDER-GRANT BY NAME: "manager"/"state"/"builder" is a weak
     mutation signal. Per-tool source check still owed for the 5
     write-defaulted: do alert/cache/project_state/template managers + page
     builder actually mutate? Conversely, any state-changing tool among the
     16 read-defaulted is under-granted (attributed but mislabeled).
   - R2 DORMANT PATH: local runs use ENABLE_AUTH_BYPASS, so this firewall
     branch is currently dormant in practice; firewall reachability is
     LEVEL<=3 (dispatch), not proven under bypass-off execution.
   - R3 RATE LIMITS: central_answer + web_page_builder defaulted to 30/min
     (registry.ts:391-394, DEFAULT_RATE_LIMIT=30). Conservative; no concern.

## Matrix implication
For these 21, PERMISSION_REACHABLE must be recorded as DEFAULTED(read|write),
not DECLARED. Firewall behavior for defaulted grants is now source-proven
(attribution required); bypass-off dispatch behavior still needs one focused
runtime probe in a later batch.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (5f-lineage) / 164 (main-lineage; +SpecificationVerificationTool)
EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN PARTIALLY_WIRED=UNKNOWN
ORPHANED=2 confirmed (codebase_navigator, generate_image) + bulk_file_generator corroborated unregistered-by-design-pending-review
DUPLICATE=0 by construction UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Per-tool mutation check for the 5 write-defaulted (read their execute paths),
then one bypass-off dispatch probe. No repair batch proposed yet.
