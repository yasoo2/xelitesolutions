# Wiring checkpoint 075 — Muse (2026-10-01)

SOURCE=BACKEND-SYNC-001 635 review evidence (pristine overlay jest logs) + read-only trace.
STATUS=PARTIAL (deep audit continues; counts below are single-observation unless noted).

## Corroborated
- ToolRegistry REGISTERED_TOOLS=164 observed on captured-main-lineage (635) bytes
  during jest setup (log line "[ToolRegistry] Registered 164 tools (71 revived)",
  seen 2x in independent rerun). REPORTED_BY_MUSE.
  Main-branch-lineage confirmation of the ~164 count (provider patch does not
  touch the registry). Composed-5f bytes reported 163 (checkpoint 074) — a
  1-tool lineage delta, recorded, not yet reconciled.
- Same logs: 21 tools with no declared permissions defaulted (list captured in
  p635 jest output), 2 tools with no rate limit set to 30/min
  (central_answer, web_page_builder). Permission/rate-limit metadata gaps are
  audit input for the wiring matrix (PERMISSION_REACHABLE column), not verdicts.

## New PARTIALLY_WIRED-adjacent instance (robustness, not wiring)
- Provider-case inconsistency in 635 router (P635-C1): toLowerCase at 2 NVIDIA
  sites vs exact === at 5 sites. Affects SELECTABILITY under case variants.
  Filed as review finding with prescription; not a registry issue.

## Carried-over wiring notes
- Discovered-vs-registered delta reconciliation still open (needs discovery
  script run on main-lineage bytes; not attempted this cycle — review priority).
- verificationTask producer-still-string (4 planner schemas) still open (074);
  no owner assigned; Muse started no fix.
- 792-entry post-freeze drift in candidate live tree (074-style preservation
  warning): load/integrate from commits, never trees.

## Next
- 076: discovered-vs-registered delta on main-lineage bytes (read-only).
- Await: 635 H1/H2/C1/B1 + NVIDIA overlap review + bound gates + post-load UAT.
