# CRITICAL-REAL-JOE-UI-001 — Muse cycle note 2026-10-01c (base db51125e)

Status this cycle: PARTIAL STANDS (fix verified, fresh full PASS not achieved).
No new Real-Joe-UI run this cycle — justified below, not skipped.

## Fresh evidence collected THIS cycle

1. Runtime probe (Muse, 2026-10-01, this cycle):
   - :5002 HTTP 200, status=OK, version=no-commit-file, uptime=47643s
     (official target; healthy but stale pre-candidate bundle).
   - :5000 HTTP 200, status=OK, version=no-commit-file, uptime=74221s.
   - :5101 DOWN (connection refused; Muse runtime offline).
   Zero change vs cycle b: same stale-healthy/down stand.
2. UI-001 fix re-verified on my tree: smoke-verification-rewrite 5/5 PASS,
   25.1s, JEST_EXIT=0 (OFFLINE/JOE_TEST/NODE_ENV=test, ephemeral test-only
   JWT, TEMP+cache redirected to workspace; stray api/logs removed after).
   First invocation showed 5/5 with a PowerShell pipe artifact exit code;
   clean rerun EXIT 0. Log: tmp/sbx-smoke06.log. Repair (1cf1102f) holds.
3. run6 (fresh csv2json UI run, TODAY, prior cycle): FAIL at honest planning
   stop, 0 files — stands as today's fresh-run evidence.

## Why no new UI run

- :5101 down, :5002/:5000 stale (no-commit-file, pre-date all pending
  batches); runtime refresh authorization + browser input blocker still
  pending per shared state; Muse must not restart/refresh runtimes.
- A second fresh run on identical runtimes adds zero new evidence.
- Next UI run belongs after an authorized current-source :5002 refresh.

## Standing requirements (unchanged)

Fresh unseen prompt, real UI, independent verification; no substitution of
unit/direct-service evidence for UI PASS. None claimed here.
