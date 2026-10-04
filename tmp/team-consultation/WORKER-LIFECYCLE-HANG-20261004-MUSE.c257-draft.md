# MUSE independent review — worker lifecycle hang observation repair
AGENT=MUSE
CONSULTATION_ID=WORKER-LIFECYCLE-HANG-20261004-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_OBSERVER_WITH_CHANGES__RECOVERY_STILL_OPEN
RECOMMENDATION=APPROVE_WITH_CHANGES
REVIEWED_UTC=2026-10-04T11:05Z
MUSE_HEAD=814dea35a9cb009d9e73f656e918c075a8c4fe4c
MUSE_BRANCH=muse/joe-development

## Exact scope reviewed (byte-pinned)
- team/runtime/Worker-LifecyclePolicy.ps1 SHA256=2DEC69CF8B2DADC38E5430056F57BD073BEA76B30D1A88A371E2F7E193E78C3E
- team/runtime/Watch-TeamWorkerLifecycle.ps1 SHA256=1C66C42E05D17E2B51C54515A5F019C98193830C5B4150EFEAE3125E95D160A5
- team/runtime/Test-WorkerLifecyclePolicy.ps1 SHA256=141BED727B0E9AC6112A4F5A30E9656D98E485783730C31D39844EDD6F2F6291
- Staged copies under D:\Joe\muse-worktree\tmp\lifecycle-review\ match shared bytes exactly and match
  team/worker-lifecycle/verified-source-20261004T130619821.json. No shared file was modified by this review.

## Root cause assessment (original hang)
AGREE with Codex diagnosis: the NVIDIA cycle94 opencode child ran ~24h with an unchanged log because the
synchronous worker pipeline has no cycle/no-output timeout, and passive monitoring treated process presence as
progress. A second contributing cause is confirmed by the message-delivery history: queued team messages were not
injected when no pending review existed, so a stalled worker could also miss recovery-relevant coordination.
This candidate repairs OBSERVATION only (detection + alerting). It does not implement timeout/recovery, which
Codex correctly leaves open. That scope split is right: a wrong automatic killer is worse than a loud observer.

## Independent verification performed (this review, PS5; no provider calls)
1. Policy suite on shared bytes: PASS 54/54 lifecycle assertions (Windows PowerShell 5.1). PS7 leg NOT
   rerun here: pwsh.exe is absent in this sandbox (Test-Path "$env:ProgramFiles\PowerShell\7\pwsh.exe" = False).
   Owner's 54/54 PS7 receipt is cited, not independently confirmed.
2. Scratch-root one-shot run of Watch (empty CoordinationRoot): EXIT=0, valid receipt JSON, both workers
   OBSERVATION_FAILED because Get-CimInstance is access-denied in this sandbox. This end-to-end exercises the
   probe-failure path without crashing and proves fail-closed behavior (NeedsAttention=true, no fabricated state).
3. Singleton lease: second writer while lock held fails with IOException, EXIT=1, writes nothing. Confirmed.
4. Alert emission + atomic current.json write confirmed in scratch (2 alerts + current.json + monitor.lock).
5. Live monitor behavior: current.json ObservedUtc 2026-10-04T10:43:51Z, MonitorId 16936. MUSE correctly
   OUTPUT_PROGRESS_NOT_ENGINEERING_VERIFIED (my live session.jsonl tracked, 9 descendants, QuietSeconds 0).
   NVIDIA cycle95 correctly flagged STALL_SUSPECTED_REQUIRES_SAFE_RECOVERY (log 1502 bytes unchanged since
   10:02:53Z, QuietSeconds 2368 at observation, 0 descendants). No worker, process, Git, or runtime state was
   touched by this review (Get-CimInstance is denied in-sandbox, so the live process tree itself is cited from
   the monitor receipt, not independently re-enumerated).

## Proposal errors / gaps found (all bounded, none blocking the observer concept)
F1. STALL verdict flaps on transient descendants. Live evidence: NVIDIA alerts at 10:35:51 (STALL, 0 desc) ->
   10:40:40 (QUIET_WITH_ACTIVE_DESCENDANTS, 2 desc) -> 10:42:16 (STALL, 0 desc) within 7 minutes. Each
   transition emits an alert. Short-lived git/rg children oscillate the recovery guidance and will spam alerts.
   Fail-safe direction is correct (descendants => DO_NOT_INTERRUPT), but REQUIRE a debounce: e.g. STALL only
   after K consecutive quiet polls with zero descendants, or a minimum dwell time before re-alerting the same
   cycle identity.
F2. Per-worker evidence collection is unguarded. One try/catch covers only the CIM probe. If logs/ is missing
   while a cycle is alive (line 45, Get-ChildItem -ErrorAction Stop), or the Muse session-tree scan hits a
   transient IO error, the whole observation dies including the healthy worker. REQUIRE per-agent error
   isolation (record OBSERVATION_FAILED for the affected worker, continue with the other) and defensive
   creation of the logs directory as is already done for outputRoot.
F3. PROCESS_COMPLETED / PROCESS_FAILED states are unreachable: Watch never passes -ExitCode (always null), and
   a dead process has no CIM row to read an exit code from anyway. The policy tests pin states the watcher
   cannot produce. REQUIRE either documenting them as reserved for a future launcher-integrated probe or
   removing them so tests do not imply coverage that cannot fire.
F4. The 54 assertions cover Worker-LifecyclePolicy.ps1 ONLY. Watch wiring (child detection, session-selection
   integration, lease, alert emission, restart-freshness branch lines 60-73) has zero automated tests.
   REQUIRE a small scratch-root integration test (empty root, lease contention, first-sight-vs-restart
   freshness) using this review's scratch procedure as the seed. No provider or live-worker involvement needed.
F5. Session-tree scan cost is unbounded: Get-ChildItem -Recurse over the whole Muse sessions store every 60s.
   Acceptable now; REQUIRE a bounded depth/recency guard before this pattern is copied to any higher-frequency
   monitor.

## Simpler alternatives considered
- A1 (preferred for the NEXT step, not this one): put the bounded cycle/no-output timeout in the worker parent
  itself with the same descendant-deferral + identity rules, instead of building an external privileged killer.
  Keeps kill authority local to the launcher that owns the child.
- A2: alert only on transitions INTO attention states with a per-cycle cooldown, rather than every transition
  between attention states (cheap partial fix for F1).
- A3: do nothing beyond this observer until one more stall is caught end-to-end; the observer's value is proven
  only when a real stall alert leads to a safe, authorized recovery. The current NVIDIA cycle95 signal is that
  live test case — observe, do not force.

## Overlap with existing work
None. Coordination-only scope (team/runtime + team/worker-lifecycle). No Joe source, registry, planner,
verification, CLI producer, or provider file is touched. NVIDIA's owned CLI/verification rework and Muse's
security/wiring review lanes are untouched. No competing implementation created.

## Conflict / regression risks
- No worker, script-activation, Git, source, runtime, or data change in this batch: the observer only appends
  receipts/alerts. Regression surface is limited to disk growth in team/worker-lifecycle (mitigated by F1 fix)
  and a second 60s CIM poller (negligible; F5 noted).
- Worker parents still run OLD message-delivery functions until natural reload; observer activation must not be
  confused with worker-code activation (same distinction Codex already records).
- The live NVIDIA STALL_SUSPECTED signal must NOT trigger any automatic action from any worker: recovery
  ownership is Codex/human per control plane, and cycle95 shows intermittent transient descendants.

## Maintainability / security impact
- Positive: small, single-purpose scripts; explicit state names that cannot be mistaken for engineering proof;
  no command-line/session content is stored or printed (verified by source read: CommandLine only matched with
  -like, session files only stat()ed). No credentials, no provider calls, no network.
- F2/F4 fixes keep it that way; no new dependencies.

## Required tests (before calling the observer DONE)
1. Rerun Test-WorkerLifecyclePolicy.ps1 on PS7 outside this sandbox (owner receipt exists; needs non-sandbox
   confirmation after any F-change).
2. New scratch-root integration test for F4 (empty root, lease contention, restart-freshness); must pass on
   PS5 and PS7.
3. F1 debounce test: simulated flapping descendant counts must not re-alert the same cycle within the dwell
   window; sustained zero-descendant quiet must still reach STALL_SUSPECTED.
4. F2 fault-injection test: missing logs dir / failing session scan must degrade one worker, not kill the run.
5. One live end-to-end confirmation: next real stall alert carries correct identity/descendant evidence and a
   human-authorized recovery follows the existing guarded procedure. No synthetic PASS.

## Real Joe UAT
NOT APPLICABLE to this batch (coordination observer; no Joe product behavior changed). No Real Joe UAT is
claimed or required. The live NVIDIA cycle95 STALL signal is operational evidence for the observer, not Joe
product evidence. CRITICAL-REAL-JOE-UI-001 (:5002 currently unreachable, verified this cycle) and the wiring
audit remain open and are not affected by this review.

## Live NVIDIA observation (no action taken)
NVIDIA cycle95 child 19532: log nvidia-2026-10-04_12-17-04-cycle-95.log is 1502 bytes, unchanged since
10:02:53Z; monitor reports QuietSeconds 2368+ with flapping 0/2 descendants. This matches an early second
stall signature OR one long synchronous tool call. Per ownership rules I take NO recovery action and do not
interrupt anything; recovery design/authorization belongs to Codex/human. Next checkpoint should compare real
NVIDIA output/reviews/source against this signal.

## F6 addendum (same cycle, live evidence 11:08Z)
F6. The monitor cannot see source edits. NVIDIA cycle95's log has been quiet since 10:02:53Z and the monitor
flags STALL_SUSPECTED, yet NVIDIA committed a genuine 15+/9- PhaseExecutorTool.ts Gap A/B refinement to its
dirty tree at 11:08Z (read-only diff inspected; semantic verification-ledger change, clearly deliberate
engineering, not probe fallout). Log-quiet + zero-descendants therefore must NOT auto-confirm a stall: REQUIRE
a source-drift check (mtime/diffstat/hash comparison of owned dirty scopes, as Codex's preservation check
already does manually) as part of STALL confirmation before any recovery decision. Without it, the observer
risks interrupting — or a human risks cancelling — a quietly-productive worker. This strengthens, not weakens,
the APPROVE_WITH_CHANGES position: observation first, recovery only on multi-signal confirmation.

## Required outcome
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_OBSERVER_WITH_CHANGES__RECOVERY_STILL_OPEN
RECOMMENDATION=APPROVE_WITH_CHANGES
NOTE=Shared consultation file not written: this sandbox permits writes only under D:\Joe\muse-worktree
(plus temp). This fallback response is written for collector receipt per the consultation's own fallback rule.
No agreement with any other agent is inferred or claimed.
