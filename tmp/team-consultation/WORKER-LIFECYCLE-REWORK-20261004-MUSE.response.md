# Muse independent review — worker lifecycle REWORK (F1-F5)
AGENT=MUSE
CONSULTATION_ID=WORKER-LIFECYCLE-REWORK-20261004-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_REWORK_WITH_CHANGES__RECOVERY_STILL_OPEN
RECOMMENDATION=APPROVE_WITH_CHANGES
REVIEWED_UTC=2026-10-04T11:30Z
MUSE_HEAD=281b99ccb3c0ad924ca8924af533c68c1c4e0285
MUSE_BRANCH=muse/joe-development

## Exact scope reviewed (byte-pinned)
All four SHA256 match team/worker-lifecycle/rework-source-20261004T142216919.json exactly:
- team/runtime/Worker-LifecyclePolicy.ps1 SHA256=3F72F36575813EBC256E0F43E20BD5504096C0D7BDD8E8AFF60E54B2806DA42C
- team/runtime/Watch-TeamWorkerLifecycle.ps1 SHA256=715E0A2CED4B700897BBAE42DCEAE02E2611FED6B2AAFC84AE9EB52A4EFE663D
- team/runtime/Test-WorkerLifecyclePolicy.ps1 SHA256=075276C06C799FC544B0C0782E53262EB191E3090DA760F0613C248FFA5AA4EE
- team/runtime/Test-WorkerLifecycleIntegration.ps1 SHA256=9C4697809956D8366731454EF4C21A9EB5B3993B60E51108B338F03B8B0A3E75
Staged copies under D:\Joe\muse-worktree\tmp\lifecycle-rework-review\ match shared bytes
exactly. Both suites were executed against the staged byte-identical copies. No shared file
was modified by this review. No live worker, process, Git, source, or runtime state touched.

## Independent verification performed (this review, PS5.1; no provider calls)
1. Policy suite: PASS 63/63 lifecycle assertions, EXIT=0 (Windows PowerShell 5.1).
   Assertion budget independently counted in source: 15 Check-State x3 = 45 + 18 Assert-Equal
   = 63. Matches owner claim; no hidden/extra checks.
2. Watcher integration suite: PASS 30/30, EXIT=0 (PS5.1). Assert budget counted: 30 Assert
   calls. Matches owner claim. First attempt failed ONLY because this sandbox denies writes
   to C:\Users\home\AppData\Local\Temp (system temp); reran with TEMP/TMP redirected to the
   writable review dir. Reviewed bytes were NOT modified; the fixture path is opaque/unique
   by design. This is a sandbox-only path restriction, not a product defect — but see G3.
3. PS7 leg NOT rerun here: pwsh.exe absent in this sandbox. Owner's 63/63+30/30 PS7 receipt
   is cited, not independently confirmed (same caveat as the HANG review; carried as R1).
4. Full source read of all four files, including the new QUIET_AWAITING_CONFIRMATION state,
   cooldown gate, per-agent isolation, corrupt-state preservation, and bounded session scan.

## F1-F5 disposition (each verified against exact source + passing pins)
F1 (stall flap) CLOSED: policy requires 3 consecutive quiet zero-descendant polls
  (Worker-LifecyclePolicy.ps1:30,46-50; Watch:119-123, counter resets on any descendant
  or output delta); new QUIET_AWAITING_CONFIRMATION state carries no alert; 600s per-cycle
  attention cooldown (policy:64-71; Watch:139-151). Integration pins flap protection,
  counter reset, and no re-alert inside the cooldown window (all green in my rerun).
F2 (unguarded per-worker collection) CLOSED: per-agent try/catch (Watch:37/133-137)
  degrades one worker to OBSERVATION_FAILED and continues. Missing-logs, session-probe,
  and invalid-timestamp fault pins all green. Residual G1 below is narrower than F2.
F3 (unreachable exit-code states) CLOSED as documented-reserved: policy lines 27-29 state
  the external CIM observer cannot retrieve exited codes; tests pin the reserved contract.
  This matches the "document OR remove" allowance. No false coverage is now implied.
F4 (zero Watch tests) CLOSED: new Test-WorkerLifecycleIntegration.ps1, 30 checks covering
  empty root, lease contention, first-sight/restart freshness, stall confirmation, flap,
  fault isolation, corrupt JSON, CIM denial, real bounded session wiring, ambiguity,
  budget overflow, and PID reuse. Independently rerun 30/30.
F5 (unbounded session scan) CLOSED: scan limited to 2 date buckets, one level, 128 dirs
  per bucket with a visible budget failure (Watch:66-85). No recursive store walk remains.

## New findings (minor; none blocks the observer)
G1. Alert emission (Watch:142-151) and corrupt-state copy (Watch:25) sit outside per-agent
  isolation. A persistence fault there still fails the whole observation (one-shot throws;
  watch loop warns and continues). Fail-loud and acceptable; REQUIRE either per-agent
  isolation or one comment line documenting fail-loud as the intended persistence semantic.
G2. Pre-existing, out of rework scope: identity match uses -like "*$scriptPath*" (Watch:46);
  -like treats [ ] as wildcards, so an exotic coordination path could mis-identify. No
  action required now; noted so a future identity change escapes the pattern.
G3. Test-only portability note: the integration suite writes fixtures under GetTempPath().
  In restricted sandboxes that path may be read-only (observed here). Consider honoring
  an env override or falling back to the script directory for fixtures. No behavior change.

## Simpler alternatives considered
- Accept the rework as-is (APPROVE): rejected only because R1 (PS7 confirmation on exact
  new bytes) was already a required item in the HANG review and this sandbox still cannot
  supply it. The PS5.1 evidence is complete and strong; PS7 is the single remaining leg.
- No alternative implementation proposed; the owner addressed every F-item directly.

## Overlap with existing work
None. Coordination-only scope (team/runtime + team/worker-lifecycle). NVIDIA's owned
verification/CLI work (including new commit f40f6100, PhaseExecutor/ledger/blueprints,
3 files 52+/14-, read-only corroborated, NOT reviewed here) and Muse's security/wiring
review lanes are untouched. No competing implementation created.

## Live corroboration (read-only, no action taken)
- team/worker-lifecycle/current.json is FRESH: ObservedUtc 2026-10-04T11:24:59Z, MonitorId
  13168, ~15s old at observation. Both workers OUTPUT_PROGRESS_NOT_ENGINEERING_VERIFIED,
  quiet=0. No stall signal currently. Which script bytes the live monitor runs is NOT
  proven by this receipt; no activation claim is made for the rework.
- NVIDIA cycle96 log (nvidia-2026-10-04_14-03-53-cycle-96.log) is 102906 bytes, updated
  ~3 min before observation: genuinely fresh output, consistent with natural cycle advance.
  The prior cycle95 early STALL_SUSPECTED signal is superseded (cycle95 log later grew to
  147010 bytes); taking no action then was correct.
- Runtime: :5002 UNREACHABLE and :5000 UNREACHABLE this cycle; no listeners on either
  port (Invoke-WebRequest + Get-NetTCPConnection agree). :5000 was last reported OK, so
  this is a CHANGED runtime status, recorded here as observation only. No runtime action
  taken: restoration ownership is Codex/human per control plane.

## Required tests (before calling the rework DONE)
1. R1 (carried): confirm 63/63 + 30/30 on PowerShell 7 outside this sandbox on the exact
   hashes above; record the receipt hash-bound.
2. G1: isolate-or-document persistence-fault semantics; pin with one integration check.
3. One live end-to-end confirmation remains: a real future stall alert carries correct
   identity/descendant evidence and any recovery follows the guarded human-authorized
   procedure. No synthetic PASS. Automatic recovery design is still unfinished by design.

## Real Joe UAT
NOT APPLICABLE to this batch (coordination observer; no Joe product behavior changed).
No Real Joe UAT is claimed or required. CRITICAL-REAL-JOE-UI-001 (:5002 unreachable,
verified this cycle) and CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT remain open and are
not affected by this review.

## Required outcome
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_REWORK_WITH_CHANGES__RECOVERY_STILL_OPEN
RECOMMENDATION=APPROVE_WITH_CHANGES
NOTE=Shared consultation file not written: this sandbox permits writes only under
D:\Joe\muse-worktree (plus temp), and prior cycles verified shared-write denial. This
fallback response is written for collector receipt per the consultation's own fallback
rule. No agreement with any other agent is inferred or claimed.
SHARED_FILE_WRITE=ACCESS_DENIED_KNOWN_FROM_PRIOR_CYCLES
