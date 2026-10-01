SOURCE_AGENT=MUSE
BATCH_ID=JOE-WIRING-P4-BATCH-001
STATUS=PROPOSED_FOR_TEAM_REVIEW (not implemented; audit mode)
MUSE_HEAD=a24726fa
UPDATED=2026-10-02
NOTE=Workspace copy; shared D:/Joe/coordination/team/ write blocked by
sandbox. Codex may import. No implementation authorized by this batch.

EVIDENCE_BASE=WIRING-CHECKPOINT-079/080/081/082/083/084 (Muse workspace),
MONITORING-ACTION-CONTRACT-010 proposal + Codex observation evidence.
All items re-verified current on exact HEAD by the 084 probe (12/12).

---------------------------------------------------------------
P4-1: missing sideEffects declarations (cache_manager, web_page_builder)
FINDING (080, re-verified 084): both declare perms=[] fx=[] yet truly
mutate (static cache Map with TTL; real files under ARTIFACT_DIR).
The name-heuristic write label is CORRECT BY LUCK and currently closes
the attribution hole (proven enforced bypass-off in 082).
REPAIR: declare sideEffects=['write'] (+ explicit write permission for
web_page_builder). Behavior-neutral, declaration-only.
SEVERITY=P4 maintainability. RISK=negligible (no behavior change).
TESTS: declaration pin per tool + auth-gate neighbors + 2 AGENTS guards.
OWNER: unassigned; any worker may take after review (no overlap with
active NVIDIA/observation or provider scopes).
---------------------------------------------------------------
P4-2: template_manager over-grant (read-only labeled write)
FINDING (080, re-verified 084): execute() returns static in-memory
templates; no fs/map/external mutation. Labeled write by name.
REPAIR: declare explicit permissions=['read'] (and keep fx=[]).
SEVERITY=P4 label hygiene. RISK=negligible (attribution still required
either way; label becomes truthful).
TESTS: declaration pin + bypass-off attribution neighbor.
OWNER: unassigned; may ride with P4-1 as one declaration commit.
---------------------------------------------------------------
P4-3: monitoring action-split + error-context isolation (P2 severity)
FINDING (081/083, blob re-verified 084): get_metrics is read-pure but
track mutates process-global counters and reset wipes all metrics
without confirmation, all labeled read. Static errors[] carries
arbitrary caller {context:any} across instances with no attribution —
cross-context readable via get_metrics in a multi-user future.
Gateway attribution still applies; no live-gateway exploit proven.
REPAIR (not implemented): action-aware contract (read vs mutating
actions), partition/drop error context by trusted ToolService context,
gate reset behind operator authorization. Blanket 'write' relabel alone
is INSUFFICIENT (over-blocks get_metrics, leaks context anyway).
SEVERITY=P2 design defect (integrity/isolation), kept in this batch for
single-review convenience. RISK of repair: medium (contract-layer
change) — requires the proposal's ownership split.
TESTS: per-action permission pins, cross-context leakage negative test,
reset authorization test, + AGENTS gates.
OWNER per MONITORING-ACTION-CONTRACT-010: Codex bounded implementer,
Muse independent reviewer, NVIDIA gateway/policy assessment. Muse does
NOT take implementation here.
---------------------------------------------------------------
P4-4: F-082-1 dead workspace_required branch (record only)
FINDING (082, re-verified 084): ToolService auto-assigns
contextWorkspaceId before the firewall branch, so the workspace gate
cannot fire on this path; the live gate is the user check. Dead branch
+ single-user-default workspace under a bypass-off multi-user future.
REPAIR: NONE PROPOSED. Attribution-behavior change requires team
consultation first. Record only; do not repair unilaterally.
---------------------------------------------------------------
NO-ACTION (documented for completeness):
- shell_check_status: wait-like map-entry reaping on dead pids (081).
  Standard lifecycle GC; borderline-read, not security-relevant.
- ask_user: outbound user_input_request UI event (081). No persisted
  state change; borderline-read, not security-relevant.
- alert_manager / project_state_manager: correctly attributed via
  declared sideEffects + defaulted label (080). No change needed.
- central_answer / web_page_builder 30/min default rate limits (079-R3).
  Conservative; no concern.
---------------------------------------------------------------
INTEGRATION NOTES: P4-1+P4-2 are safe to combine into one small
declaration commit after review. P4-3 and P4-4 must stay separate and
require their consultations/owners. No item in this batch authorizes
ToolService/registry behavior edits by Muse.
