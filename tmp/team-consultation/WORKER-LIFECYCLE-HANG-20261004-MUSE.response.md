# Muse independent review — WORKER-LIFECYCLE-HANG-20261004
AGENT=MUSE
CONSULTATION_ID=WORKER-LIFECYCLE-HANG-20261004-MUSE
HEAD=0caa3bb0b495432691f923e2bd82f244c764fcb6
TRACKED_TREE=CLEAN (0 tracked modifications at cycle start; api/ byte-identical to c235-tested tree 15ba6509)
UPDATED=2026-10-04 (this cycle; independent source inspection + test execution)
SHARED_FILE_WRITE=NOT_ATTEMPTED (standing fallback channel; collector imports)

## REVIEWED BYTES (exact)
- team/runtime/Test-WorkerLifecyclePolicy.ps1 SHA256 141BED727B0E9AC6112A4F5A30E9656D98E485783730C31D39844EDD6F2F6291 (52 lines)
- team/runtime/Worker-LifecyclePolicy.ps1 SHA256 2DEC69CF8B2DADC38E5430056F57BD073BEA76B30D1A88A371E2F7E193E78C3E (77 lines)
- team/runtime/Watch-TeamWorkerLifecycle.ps1 SHA256 1C66C42E05D17E2B51C54515A5F019C98193830C5B4150EFEAE3125E95D160A5 (112 lines)
- All three mtime 2026-10-04T09:59:44Z (single save batch; Codex actively developing during review)

RACE NOTE (methodology): my first read served pre-09:59:44 bytes (46-line test).
My static count then (50 increments) disagreed with the harness print (54/54),
which forced a re-read and reconciled exactly (13x3 + 15 direct = 54 on current
bytes; old bytes would print 50/50, so the 54/54 run is proven on current bytes).
This position covers CURRENT bytes only. No agreement with Codex inferred.

## INDEPENDENT TEST EXECUTION (this cycle)
- Ran Test-WorkerLifecyclePolicy.ps1 unmodified (Windows PowerShell, Bypass):
  PASS 54/54 lifecycle assertions. No real worker, provider, or network invoked.
- Confirmed worker identity anchors exist read-only: muse-worker.ps1 (24894 B),
  nvidia-worker.ps1 (16468 B), both -worker.lock files (7 B each).
- Did NOT start the watcher (would write team/worker-lifecycle state; owner runs it).

## POSITION
APPROVE the observation-only design; it is the minimal safe shape for the
cycle94 failure class (process alive, zero progress 24h). Correct properties
verified in source: no termination path (AutomaticTerminationAllowed=false
pinned), no provider calls, no Git/source mutation, metadata-only receipts and
immutable CreateNew alerts (no command lines, no session content — only
Path/Bytes/CreatedUtc/UpdatedUtc), PID+name+commandline parent check and
PID+CreationDate cycle identity (PID reuse guarded), full descendant-tree BFS
with QUIET_WITH_ACTIVE_DESCENDANTS deferral (no atomic interruption), empty-file
touch excluded from progress, truncation/disappearance treated as regression,
monitor-restart freshness preserved from real write times (no fabricated
activity), state-change-only alerting (no spam), atomic current.json publish,
singleton lease excluding concurrent writers, Turkish-culture timestamp pin.

## REQUIRED CHANGES
- F1 (required before recovery decisions rely on the monitor): three crash-
  instead-of-observe paths. (a) Corrupt current.json: ConvertFrom-Json at
  watcher :20 throws under Stop preference, killing the run with NO receipt.
  (b) Missing logs dir: Get-ChildItem -ErrorAction Stop at :45 throws the
  same way. (c) Malformed UpdatedUtc/CreatedUtc: ConvertTo-WorkerUtc Parse
  throws inside delta/session selection. All three must degrade to a fresh
  baseline plus an OBSERVATION_FAILED attention record, never a dead monitor.
- F2 (implement or document): PROCESS_COMPLETED_NOT_ENGINEERING_VERIFIED and
  PROCESS_FAILED are currently UNREACHABLE — the watcher never passes
  ExitCode (always null, so dead cycles read BETWEEN_CYCLES_OR_EXIT_UNKNOWN).
  Either capture exit codes (retained handles/job objects) or mark both
  states reserved in the header so no reader assumes completion/failure is
  currently detected.

## RECOMMENDED (non-blocking)
- F3: watcher-level behaviors are untested (policy units are pinned 54/54):
  add fixture-based tests for PID-reuse rejection, restart freshness,
  lease contention (second writer fails loud), alert dedup across polls,
  log rotation vs deletion, and Muse session-selection integration.
- F4 (minor): session scan (:52) lacks the -1min creation margin logs have
  (:48); align or justify the asymmetry.
- F5 (minor): stale current-$PID.tmp litter on kill; NVIDIA freshness is
  logs-only (no session equivalent — honest, note it); MuseSessionsRoot
  silently degrades under a wrong USERPROFILE (note it); child detection
  (MUSE cmd.exe / NVIDIA opencode.exe, direct children only) is coupled to
  the current launcher — document the assumption.

## SIMPLER ALTERNATIVES CONSIDERED
- Process-existence polling: REJECTED — proven insufficient by cycle94 itself.
- Collector-index freshness: REJECTED — measures review receipt, not worker
  progress. Session.jsonl + log freshness is the correct cheap signal.
- Provider-call tapping: REJECTED — out of scope, privacy/cost.
- Fixed cycle timeout with auto-kill: REJECTED — violates no-interrupt-atomic.
- Within-design simplification: drop the ExitCode states until capturable
  (F2-doc option). No simpler safe monitor shape found.

## RISKS
- False STALL_SUSPECTED on a long quiet single model call (no descendants, no
  log writes >30min). Accepted direction: suspected goes to human review, and
  nothing auto-terminates. QuietLimit 1800s default is sane.
- Session.jsonl freshness reflects harness activity, not engineering output;
  state names honestly say NOT_ENGINEERING_VERIFIED — keep that wording in
  every consumer.
- Monitor has no supervisor; staleness is detectable via MonitorId +
  ObservedUtc in current.json. Acceptable for v1.

## OVERLAP / SCOPE
- None. Codex owns implementation; Muse implements nothing here and modified
  no scripts. NVIDIA owns CLI/verification repair (19 dirty files, untouched
  read-only; 9/9 review hashes MATCH C255 baselines this cycle). No api/
  source edit by Muse this cycle.

## EVIDENCE
- This response (fallback channel for collector import)
- Independent run: PASS 54/54, Windows PowerShell, Bypass, no workers invoked
- Reviewed-byte hashes listed above (all mtime 2026-10-04T09:59:44Z)

## RECOMMENDATION
APPROVE_WITH_CHANGES: F1 required before the monitor gates any recovery
decision; F2 document-or-implement; F3 before scale-out. Design direction
APPROVED. No product PASS implied; both CRITICAL objectives remain OPEN.

## CYCLE-257 ADDENDUM (MUSE_HEAD 814dea35; same bytes re-verified, new live evidence)
STATUS=REVIEWED_BY_MUSE (reaffirmed)
BYTE DRIFT: none. Staged SHA256 of all three scripts still 141BED72/2DEC69CF/
1C66C42E, matching both the c256 review and verified-source-20261004T130619821.
Suite re-run on shared bytes: PASS 54/54 (Windows PowerShell 5.1). PS7 leg
still not independently rerun here (pwsh.exe absent in sandbox; owner receipt
cited, not confirmed). Full c257 working notes preserved alongside this file in
WORKER-LIFECYCLE-HANG-20261004-MUSE.c257-draft.md; nothing from c256 removed.
NEW EVIDENCE (scratch-root watcher runs; live monitor receipts; read-only):
- W1: one-shot Watch against an EMPTY scratch CoordinationRoot: EXIT=0, valid
  receipt, both workers OBSERVATION_FAILED (Get-CimInstance denied in sandbox),
  proving the probe-failure path is fail-closed end-to-end with no crash.
- W2: singleton lease enforced: second writer fails IOException EXIT=1, no
  state written. Alert emission + atomic current.json confirmed in scratch.
- F6 (NEW, required before any recovery relies on STALL): verdict flaps on
  transient descendants. Live NVIDIA alerts 10:35:51 STALL(0 desc) ->
  10:40:40 QUIET_WITH_ACTIVE_DESCENDANTS(2 desc) -> 10:42:16 STALL(0 desc)
  within 7 minutes, one alert per transition. Require debounce (K consecutive
  quiet polls / dwell time) - fail-safe direction is correct, guidance is noisy.
- F7 (NEW, required for STALL confirmation): the monitor cannot see source
  edits. NVIDIA cycle95's log is quiet since 10:02:53Z (STALL_SUSPECTED), yet
  NVIDIA made a genuine 15+/9- PhaseExecutorTool.ts Gap A/B refinement at
  11:08Z (read-only diff inspected; owned lane, untouched). Log-quiet must
  therefore be confirmed with a source-drift check before any recovery decision.
- No worker/process/Git/runtime state touched. No agreement inferred.
RECOMMENDATION (unchanged): APPROVE_WITH_CHANGES (F1+F6+F7 required before
recovery reliance; F2 document-or-implement; F3 before scale-out).

## COORDINATION_FALLBACK
AGENT=MUSE
STATUS=ACTIVE
TASK=c256 lifecycle review (WORKER-LIFECYCLE-HANG independent review) + F5 dispatch-fork probe
SUBSYSTEMS=verification-review,tool-wiring
HEAD=0caa3bb0b495432691f923e2bd82f244c764fcb6
CLAIM=c256 lifecycle independent review + F5 web_search fork executable proof; no api/ edits
HEARTBEAT=ACTIVE lifecycle review recorded; F5 probe running; :5002 BLOCKED
HANDOFF=none yet (docs/evidence only until probe lands)
UAT=BLOCKED (:5002 official UI unreachable; :5000 API-only)
END_COORDINATION_FALLBACK
