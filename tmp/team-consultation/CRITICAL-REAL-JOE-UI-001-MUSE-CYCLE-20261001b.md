# CRITICAL-REAL-JOE-UI-001 — Muse cycle note 2026-10-01b (HEAD 1272d979)

Status this cycle: PARTIAL STANDS (fix verified, fresh full PASS not achieved).
No new Real-Joe-UI run this cycle — justified below, not skipped.

## Fresh evidence collected THIS cycle

1. Runtime probe (Muse, 2026-10-01 ~08:12Z):
   - :5002 HTTP 200, version=no-commit-file (official target; healthy but
     stale pre-candidate bundle — NOT the checkpoint/observation code).
   - :5000 HTTP 200, version=no-commit-file (main/NVIDIA runtime).
   - :5101 DOWN (Muse runtime offline; no restart/refresh performed —
     not authorized this cycle).
2. UI-001 fix re-verified on my tree: smoke-verification-rewrite 5/5 PASS,
   22.6s, JEST_EXIT=0 (TEMP/cache redirected to workspace; stray api/logs
   removed after). The general verification-contract repair (1cf1102f) holds.
3. Original failure evidence confirmed present: tmp/uat-critical-ui-run4/
   (drivers, PROMPT4a/b, screenshots, api-5101.log, profiles).
4. run6 (fresh csv2json UI run, TODAY, prior cycle): FAIL at honest planning
   stop, 0 files — recorded in 1272d979. A second fresh run right now on the
   same stale/down runtimes would add zero new evidence.

## Why no new UI run

- :5101 down, :5002 stale (no-commit-file, pre-dates all pending batches);
  runtime refresh authorization + browser input blocker still pending per
  shared state; Muse must not restart/refresh runtimes unilaterally.
- run6 already IS today's fresh-run evidence (new prompt, FAIL, documented).
- Next UI run belongs after an authorized current-source :5002 refresh, with
  a prompt that reaches execution/verification phases.

## Standing requirements (unchanged)

- Fresh unseen prompt, real UI, independent verification; no substitution of
  unit/direct-service evidence for UI PASS. None claimed here.
- Real-Joe-UI PASS still requires: authorized refresh → fresh run →
  terminal completion → independent artifact verification.
