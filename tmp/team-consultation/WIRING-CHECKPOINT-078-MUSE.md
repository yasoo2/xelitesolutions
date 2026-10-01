# WIRING CHECKPOINT 078 — MUSE (2026-10-01)
MODE=TWO_AGENT_CONTINUITY (audit continues; no broad restructure, no deletions)
MUSE_HEAD=b8ab42bf (this checkpoint; commit pending)

## Fresh evidence this cycle (read-only, exact 56f candidate runtime)
Source: team/verification/observation-output-20261001/muse-f1-f2-56f.log
(equals my independent rerun output shape; registry lines identical)

1. REGISTERED_TOOLS=163 on 5f-lineage candidate boot ("Registered 163 tools,
   71 revived"). Corroborates Muse 163 (checkpoint 074/076) for this lineage;
   main-lineage 164 (+SpecificationVerificationTool) stands per 075/076.
   Lineage-qualified counts, not a single global number.
2. PERMISSION DEFAULTING: 21 tools "declared no permissions — defaulted"
   (list: business_logic_parser, chaos_test_plan, compliance_validator,
   cloud_cost_estimator, ambiguity_resolver, multi_agent_debate,
   self_confidence_evaluator, project_planner, central_answer,
   web_page_builder, form_inbox, echo, shell_check_status, ask_user,
   json_query, alert_manager, cache_manager, monitoring,
   project_state_manager, request_analyzer, template_manager).
   Wiring-matrix implication: for these 21, PERMISSION_REACHABLE must be
   recorded as DEFAULTED (read/write assigned by registry fallback), NOT as
   explicitly-DECLARED. Firewall behavior for defaulted tools needs one
   focused dispatch probe in a later batch (do they execute under default
   grants, and is `write` default for web_page_builder/alert_manager/
   cache_manager/project_state_manager/template_manager intended?).
3. RATE-LIMIT DEFAULTING: 2 tools (central_answer, web_page_builder) "had no
   rate limit — set to 30/min". Same treatment: DEFAULTED, not declared.
4. No NEW orphan/duplicate/registration finding this cycle; carry-overs stand:
   codebase_navigator ORPHANED, generate_image ORPHANED+dangling alias,
   visual_qa PARTIALLY_WIRED, verificationTask string/object PARTIALLY_WIRED,
   IMPLEMENTED_NOT_REGISTERED=0 on main bytes (077).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (5f-lineage) / 164 (main-lineage; +SpecificationVerificationTool)
EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN PARTIALLY_WIRED=UNKNOWN
ORPHANED=2 confirmed (codebase_navigator, generate_image) + bulk_file_generator corroborated unregistered-by-design-pending-review
DUPLICATE=0 by construction (076) UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Focused dispatch probe for the 21 default-permission tools (registry fallback
-> firewall -> executor), then continue registry reconciliation toward
JOE-CAPABILITY-WIRING-MATRIX.md entries. No repair batch proposed yet.
