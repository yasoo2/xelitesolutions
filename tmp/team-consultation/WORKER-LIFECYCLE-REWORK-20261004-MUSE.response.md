# Muse independent RE-review — worker lifecycle REWORK delta (G1 closure)
AGENT=MUSE
CONSULTATION_ID=WORKER-LIFECYCLE-REWORK-20261004-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_REWORK_G1_CLOSED__RECOVERY_STILL_OPEN
RECOMMENDATION=APPROVE_WITH_CHANGES
REVIEWED_UTC=2026-10-04T11:45Z
MUSE_HEAD=182c256ee1b3c4927eff27e4b0c47070fc006407
MUSE_BRANCH=muse/joe-development
SUPERSEDES_REVIEW=2026-10-04T11:30Z (old pinned bytes 715E0A2C/9C469780)

## Why a re-review was required
Source drift detected this cycle: current shared bytes differ from the
11:30Z-reviewed bytes. Policy + policy-test unchanged; Watch + integration
test changed:
- team/runtime/Worker-LifecyclePolicy.ps1 SHA256=3F72F36575813EBC256E0F43E20BD5504096C0D7BDD8E8AFF60E54B2806DA42C (UNCHANGED)
- team/runtime/Watch-TeamWorkerLifecycle.ps1 SHA256=9374D28B26A864A1B7EDF15302A6D4A85E90DA3C6110623826EA1901E9ABFAD7 (WAS 715E0A2C...)
- team/runtime/Test-WorkerLifecyclePolicy.ps1 SHA256=075276C06C799FC544B0C0782E53262EB191E3090DA760F0613C248FFA5AA4EE (UNCHANGED)
- team/runtime/Test-WorkerLifecycleIntegration.ps1 SHA256=DA9B742AFBE2CB7C7A8DD910FB41024FB105388133A4271B5EADD5551DED930E (WAS 9C469780...)
The 11:30Z APPROVE_WITH_CHANGES applies to the old bytes only. This review
covers the exact current bytes above.

## Exact delta reviewed (byte-pinned, additions only)
Diffed current shared bytes against staged 11:30Z copies
(D:\Joe\muse-worktree\tmp\lifecycle-rework-review\): no line removed or
altered; 9 lines added, nothing else:
1. Watch-TeamWorkerLifecycle.ps1:142-143 — 2 comment lines documenting the
   fail-loud persistence semantic ("Persistence is shared: fail loud on
   archive/alert/state-write faults. One-shot throws; watch warns/retries.
   Never publish a false healthy receipt."). Comment-only; zero behavior
   change. This is the "document" alternative of required item G1.
2. Test-WorkerLifecycleIntegration.ps1:110-116 — 7-line pin: occupies
   team\worker-lifecycle\current-<PID>.tmp with a directory so the atomic
   state write fails, then asserts one-shot throws AND current.json is absent
   ("Failed persistence cannot publish a healthy receipt"). Genuine
   fail-loud pin on the state-write path, same fault family as alert/archive
   writes (all uncaught -> throw in one-shot, warn/retry in watch loop).
Staged copies under D:\Joe\muse-worktree\tmp\lifecycle-rework-review2\
match current shared bytes exactly (hash-verified). Both suites executed
against the staged byte-identical copies. No shared file modified by this
review. No live worker, process, Git, source, or runtime state touched.

## Independent verification performed (this review, PS5.1; no provider calls)
1. Policy suite: PASS 63/63, EXIT=0 (Windows PowerShell 5.1). Bytes
   unchanged; rerun confirms no environment surprise.
2. Watcher integration suite: PASS 32/32, EXIT=0 (PS5.1) — old 30 plus the
   2 new G1 pins, all green. Assert budget counted in source: 30 old Assert
   calls + 2 new = 32. Matches.
3. TEMP/TMP redirected to the writable review dir (this sandbox denies
   writes to system temp; sandbox-only restriction, not a product defect).
4. PS7 leg NOT rerun here: pwsh.exe absent in this sandbox. Carried as R1.
5. Full read of both changed files in context; verified the new test blocks
   the real temp-receipt path (Watch:156) and that one-shot rethrow
   (Watch:177) is the asserted loud failure.

## F1-F5 + G1 disposition
F1-F5: CLOSED per 11:30Z review; delta touches none of that logic (verified
by additions-only diff), so all five closures stand on the new bytes.
G1 (persistence outside per-agent isolation): CLOSED as documented-fail-loud
+ pinned. The 2-line comment states the intended semantic at the exact
decision point; the 2-assert pin proves one-shot loudness and no false
healthy receipt. Matches the "isolate OR document + pin" requirement.
Residual notes G2 (-like wildcard identity, pre-existing, out of scope) and
G3 (test fixture temp override, test-only portability) stand unchanged.

## Root cause (of this delta)
Not a defect: owner implemented the G1 isolate-or-document requirement via
the document+pin alternative. Minimal, surgical, correctly placed.

## Proposal errors
None in this delta. The pin targets the real atomic-write path; the comment
sits at the exact branch (alert emission inside the per-agent loop). No
over-claim: alert/archive faults share the asserted code path but only the
state-write fault is pinned; the comment's broader wording is accurate
because all three faults propagate identically (uncaught in one-shot).

## Simpler alternatives considered
- Accept delta as-is within an overall APPROVE: rejected only because R1
  (PS7 confirmation on exact new bytes) remains the single required leg
  this sandbox cannot supply. PS5.1 evidence is complete and strong.
- No alternative implementation proposed; per-agent isolation of shared
  persistence would be MORE complex, not simpler.

## Overlap with existing work
None. Coordination-only scope. NVIDIA's owned verification/CLI work
(currently f40f6100 on main, read-only observed, NOT reviewed here) and
Muse's security/wiring lanes untouched. No competing implementation created.

## Conflict/regression risks
Nil. Production change is comment-only; test change is additive (new
isolated fixture root, no shared state). Full 63/63+32/32 green on exact
new bytes. No Joe product behavior changed.

## Maintainability/security impact
Maintainability: improved (explicit semantic + regression pin at decision
point). Security: none (metadata-only observer; no identity material, no
log content, no credentials; new test uses opaque fixtures).

## Live corroboration (read-only, no action taken)
- team/worker-lifecycle/current.json FRESH at observation: ObservedUtc
  2026-10-04T11:35:16Z, MonitorId 13168. Which script bytes the live monitor
  runs is NOT proven; no activation claim for the rework.
- Runtime: :5002 UNREACHABLE and :5000 UNREACHABLE this cycle (no listeners
  on either port). :5000 was last reported OK, so this remains a CHANGED
  runtime status, recorded as observation only. No runtime action taken:
  restoration ownership is Codex/human per control plane.

## Required tests (before calling the rework DONE)
1. R1 (carried): confirm 63/63 + 32/32 on PowerShell 7 outside this sandbox
   on the exact new hashes above; record the receipt hash-bound.
2. One live end-to-end confirmation remains: a real future stall alert
   carries correct identity/descendant evidence and any recovery follows the
   guarded human-authorized procedure. No synthetic PASS. Automatic recovery
   design is still unfinished by design (Muse C257 F7: source-drift, atomic
   work, preservation, identity checks required).

## Real Joe UAT
NOT APPLICABLE to this batch (coordination observer; no Joe product
behavior changed). No Real Joe UAT claimed or required.
CRITICAL-REAL-JOE-UI-001 (:5002 unreachable, verified this cycle) and
CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT remain open and unaffected.

## Required outcome
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_REWORK_G1_CLOSED__RECOVERY_STILL_OPEN
RECOMMENDATION=APPROVE_WITH_CHANGES
NOTE=Shared consultation file not written: this sandbox denies writes
outside D:\Joe\muse-worktree (probe: consultations write DENIED this
cycle). This fallback response is written for collector receipt per the
consultation's own fallback rule. No agreement with any other agent is
inferred or claimed.
SHARED_FILE_WRITE=ACCESS_DENIED_PROBED_20261004T1145Z
