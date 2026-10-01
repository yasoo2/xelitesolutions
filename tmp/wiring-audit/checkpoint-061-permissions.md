# Wiring audit checkpoint 061 — permission declarations + main still blocked (2026-10-01, Muse)

MUSE_HEAD=9159c8a9. MAIN=e8fd9589 (+14 dirty, read-only, untouched).
Mode: read-only discovery; no production source changed anywhere.
Offline in-process probes (tsx import registry only); no servers, no network,
no provider calls, no tool executions.
Probes: tmp/wiring-audit/target60.mts (main re-probe) + perm61.mts (new);
fixtures fx-target61/ + fx-perm61/perm61_MUSE.json.

## Proven this cycle
P1. MAIN TARGET60 RE-PROBE STILL BLOCKED by the identical owner dirty syntax
    break (ProjectPipelineTool.ts:698 `Expected "}" but found "]"`,
    TransformError, 0 goals evaluated). Evidence: fx-target61/main-blocked-061.txt.
    Muse did not touch, work around, or substitute the owner's dirty state.
    Unchanged since checkpoint 060 P5; owner's lane.
P2. MUSE REGISTRY PERMISSION DECLARATIONS (163 registered, import at HEAD):
    21 tools (12.9%) declare NO permissions and are silently defaulted by the
    registry at import: business_logic_parser, chaos_test_plan,
    compliance_validator, cloud_cost_estimator, ambiguity_resolver,
    multi_agent_debate, self_confidence_evaluator, project_planner,
    central_answer, web_page_builder, form_inbox, echo, shell_check_status,
    ask_user, json_query, alert_manager, cache_manager, monitoring,
    project_state_manager, request_analyzer, template_manager
    (16->read, 5->write: web_page_builder, alert_manager, cache_manager,
    project_state_manager, template_manager). Verbatim registry log preserved
    in fx-perm61/perm61_MUSE.json header note. Post-default read shows 0
    undeclared, so the log line is the authoritative pre-default evidence.
P3. SIDE-EFFECT DECLARATIONS: 89/163 declare NO sideEffects (post-import read,
    no registry defaulting observed for this field). ToolService approval
    gating reads declared permissions/sideEffects for workspace/user gating,
    so the gating surface for these 89 is UNKNOWN until the dispatch path is
    traced (deny vs allow vs ignore on missing sideEffects).
P4. RATE LIMITS: 2 tools had no rate limit, set to 30/min at import:
    central_answer, web_page_builder. Minor; recorded, not a defect claim.
P5. CROSS-EVIDENCE (not a new defect): web_page_builder — the CLI-misroute
    fallback target in C06/C10 — is permission-defaulted to WRITE and
    risk-classified medium, so autonomous web-fallback writes are
    approval-cheap. This corroborates why the producer-boundary fix (NVIDIA
    lane) matters more than any approval tweak: the misroute is a routing
    defect, not a gating defect.

## Finding
F-061-1 P3_GATING_SURFACE_UNKNOWN: 21/163 tools run on inferred permission
defaults and 89/163 declare no sideEffects on the Muse tree. EXECUTABLE and
PERMISSION_REACHABLE stay UNKNOWN for these until ToolService dispatch +
firewall behavior on missing declarations is traced with a focused runtime
probe (next step). No repair proposed (discovery only).

## Counts (proven vs unknown — no invention)
PERM61_MUSE=163 registered, 21 permission-defaulted, 89 no-sideEffects
TARGET60_MAIN=UNKNOWN (blocked: owner dirty syntax, unchanged since 060)
DISCOVERED_TOOLS=UNKNOWN EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN
PARTIALLY_WIRED=UNKNOWN ORPHANED=UNKNOWN (registry-level corroborations
stand: bulk_file_generator + generate_image IMPORTED_NOT_REGISTERED)
DUPLICATE=UNKNOWN REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0.

## Next discovery step
Focused dispatch/firewall probe: for a bounded sample (the 5
write-defaulted + web_page_builder + 2-3 read-defaulted controls), trace
executeTool dispatch + approval + firewall with synthetic inputs through the
ACTUAL ToolService (mocked transport, no side effects) and record
allow/deny per declaration state. Owner: Muse lane. No repair proposed.
