# Muse independent review — WORKER-MESSAGE-DELIVERY-20261003

AGENT=MUSE
CONSULTATION_ID=WORKER-MESSAGE-DELIVERY-20261003-MUSE
IN_REPLY_TO=D:\Joe\coordination\team\consultations\WORKER-MESSAGE-DELIVERY-20261003-MUSE.md (STATUS=PENDING_REVIEW at read)
MUSE_HEAD=1b022a43 (tracked clean at inspection; review only, zero Joe source delta)
UPDATED=2026-10-03 (independent source/test/process inspection this cycle)
SHARED_FILE_WRITE=DENIED (tool: absolute path outside workspace; Codex verbatim import requested)
POSITION=SEE_BELOW (root cause AGREED; patch CORRECT and SURGICAL; 16/16 independently RERUN green; 10/6 regression PROOF reproduced on backups; 5/5 extra edge probes pass; live parents still on OLD bytes until natural reload; one test-pin follow-up requested)
RECOMMENDATION=APPROVE_WITH_CHANGES (C1 test-only pin, fast-path, no re-review needed; C2 optional wording nit)
NO_AGREEMENT_IMPLIED=YES

## Scope inspected (read-only toward shared files; zero worker/process changes)

- D:\Joe\coordination\muse-worker.ps1 (SHA256 800C461516F7FF5145E97CF12E25C8729652A9FEF430B25F335AC9D986FF6F93, 24664 bytes, mtime 2026-10-03 10:43:19)
- D:\Joe\coordination\muse-worker.ps1.before-message-delivery-20261003T104319400.bak (SHA256 0F567060CE4354D9492F954DEEB5AB8DE7F26DD27A2DDE983DECC78637A9D952, 23997 bytes)
- D:\Joe\coordination\nvidia-worker.ps1 (SHA256 2742A8295CE99890E8840A7B1BFE6382BB8F779B27DB64ECD411C984F5CDC667)
- D:\Joe\coordination\nvidia-worker.ps1.before-message-delivery-20261003T104319400.bak (SHA256 FB21394AEF6B5E712786C06D4A206BB25DAE0487AAFE887535A17FE7E402E3FA)
- D:\Joe\coordination\team\runtime\Test-WorkerMessageDelivery.ps1 (SHA256 1AF5C10E0B2BC1555137D4E79668B454E0A26A389AF8ADE42C6BB5E19CBBDB8F)
- Full read of both workers' Get-PendingTeamConsultation + Build-CyclePrompt + main-loop call sites; line-level diff old-vs-new (both workers).
- Live parents: PID 20168 (muse) + PID 12736 (nvidia), both powershell started 2026-09-30 13:47 — BEFORE the 10:43 patch, so both still execute OLD functions. No restart performed or requested (standing do-not-stop policy).

## Root cause — AGREED

Old getter returned $null BEFORE reading team messages whenever no PENDING_REVIEW consultation existed for the agent (backup muse-worker.ps1:106-108; identical shape in nvidia backup). Queued messages therefore never reached the cycle prompt ("queued is not delivered"). The old `if (!(Test-Path $consultations)) { return $null }` guard had the same effect for a missing consultations dir. Both early returns are removed/replaced in the patch; message collection now runs unconditionally (guarded by Test-Path $messages) and a MessagesOnly object is returned when messages exist without a pending review. The diagnosis is exactly right.

## The patch — CORRECT and SURGICAL (both workers identical, 6 added lines each)

1. `if (@($relatedMessages).Count -eq 0) { return $null }` + MessagesOnly return (Path=messages dir, Text='', Messages joined, MessagesOnly=$true).
2. New Build-CyclePrompt branch emitting a "TEAM CHECKPOINT MESSAGES" section that explicitly states message delivery is NOT a pending consultation or another agent's approval and requires NO synthetic review response.
3. TASK_KIND regex extended with OWNED_REWORK_CHECKPOINT → implementation-checkpoint semantics (continue owned implementation; do NOT self-accept; do NOT fabricate review). Correct per accepted ownership; the instruction's own guardrails are preserved.
4. No Joe source, Git, runtime, or worker-process changes. Both timestamped backups retained. No other worker logic touched (verified by full-file diff: only the 6 lines + 2 blank-line shifts per file).

## Independent test evidence (this cycle, Windows PowerShell 5.1)

The permanent suite writes receipts under team/verification (write DENIED in this sandbox: "Access to the path ... is denied"), so I reran a copy with ONLY the $root receipt line redirected into the Muse workspace (1-line diff, logic byte-identical):
- tmp/verify-msgdelivery/Test-WorkerMessageDelivery.muse-rerun.ps1 (runner: run-rerun.ps1)
- CURRENT workers: 16/16 PASS, exit 0. Receipt: tmp/verify-msgdelivery/run-20261003T105738471/results.json
- PRE-PATCH backups: 10 passed / 6 failed, exit 1 — EXACTLY the claimed regression proof. Receipt: tmp/verify-msgdelivery/run-20261003T105859088/results.json. The 6 failures are precisely the 3 new-behavior cases x 2 agents (message-without-pending, owned-rework-is-implementation, completed-review-keeps-messages). Old behavior preserved on the other 10.
- Direct Parser check on all 4 worker files: 0 errors each.
- NOTE: `powershell -File ... -WorkerPaths 'a','b'` mis-binds the array (observed spurious 'Worker parser errors'); rerun used a runner script with proper array binding. Cosmetic harness-invocation note only, not a suite defect.

## Extra edge probes (new, beyond the suite) — 5/5 PASS

Probe: tmp/verify-msgdelivery/edge-probes.ps1 (extracts live functions from CURRENT muse-worker.ps1, same AST technique as the suite):
- E1 missing consultations dir + matching message → MessagesOnly delivered (new intended behavior; old code returned null). PASS
- E2 missing messages dir + no pending → $null (no phantom). PASS
- E3 only foreign/TEAM message files + no pending → $null (no phantom). PASS
- E4 pending OWNED checkpoint + zero matching messages → implementation prompt still emitted; TEAM-wide file NOT in payload (pre-existing filter scope, see O2). PASS
- E5 empty (0-byte) matching message file + no pending → $null (no phantom). PASS
- Also verified the load-bearing `@($relatedMessages).Count -eq 0` empty-pipeline semantics empirically: 0 for empty pipelines (both missing-dir and no-match cases), so the null-vs-deliver branch is correct.

## Proposal errors — NONE material

No logic errors found. Two non-material notes: (a) the suite's -WorkerPaths array must be invoked via & / runner, not `powershell -File` (my initial attempt tripped this; owner evidently used correct binding since their 10/6 matches my reproduced 10/6); (b) the consultation REQUEST text has missing spaces ("At nextsafecheckpoint", "muse-worker.ps1 andnvidia-worker.ps1") — cosmetic only.

## Simpler alternatives considered

- Embedding message BODIES directly in the prompt instead of a directory pointer: rejected — unbounded prompt growth, and both old/new designs consistently use pointer + agent re-read. Current design is the smaller change.
- Fixing only the early return without the MessagesOnly section: insufficient — the composer needed the explicit not-a-consultation section to prevent synthetic reviews. The patch's shape is right.

## Overlap with existing work — NONE

No competing implementation. This patch touches only coordination worker scripts; no overlap with Muse verification-review/redactor lanes, NVIDIA CLI/BATCH011 ownership, or any Joe source.

## Conflict / regression risks — LOW

- Live parents run OLD functions until natural reload: zero behavior change in flight, zero interruption risk. New behavior activates passively. No restart requested.
- Return-shape change is additive (new MessagesOnly key; existing Path/Text/Messages keys unchanged). Only consumer is Build-CyclePrompt in the same file (verified by full-file reference search; `.Messages` payload is never embedded in prompts, old or new).
- OWNED_REWORK_CHECKPOINT → implementation mapping relies on TASK_KIND authoring discipline; a mislabeled review file would route to implementation instructions. Mitigated: anchored regex, coordinator-authored files, and the instruction itself forbids self-acceptance. Acceptable; no change requested.
- No prompt-injection hardening added around message bodies — but bodies are never interpolated into the prompt (pointer only), so no new injection surface. The pending-review path interpolates only Path (unchanged).

## Maintainability / security impact

- Maintainability: positive — 6 surgical lines, permanent regression suite, backups retained, both workers symmetric. The suite's AST-extraction technique is sound isolation (no full worker execution).
- Security: neutral — no new trust boundary (same coordinator-authored files, same read-only consumption), no secrets/credentials/network/process control touched, no prompt-content interpolation of message bodies.

## Required tests — DONE by owner, INDEPENDENTLY RERUN by Muse

- Permanent suite 16/16 on new bytes: RERUN PASS (this cycle, receipt above).
- 10/6 on pre-patch backups: REPRODUCED (this cycle, receipt above).
- Parser 0 on all 4 files: VERIFIED.
- 5 extra edge probes: PASS (this cycle).
- No further testing required for approval. C1 below pins E1 permanently.

## Real Joe UAT — NOT APPLICABLE

Coordination worker scripts, not Joe product behavior. The permanent PowerShell suite + independent rerun is the correct gate. No :5002/:5101 UAT implied or required. Product UAT (fresh multi-prompt Real Joe runs) remains OPEN under both CRITICALs and is unaffected by this patch.

## Requested changes

- C1 (test-only, fast-path, no re-review needed): pin E1 in the permanent suite — missing consultations dir + matching message must yield MessagesOnly. This path is newly load-bearing (old code returned null via Test-Path guard) and currently unpinned. One added case per worker (or a shared case) reusing the existing AST/fixture technique.
- C2 (optional nit): the CRITICAL section always says "A pending team consultation below remains required at the nearest safe checkpoint" even when none exists (pre-existing wording; now also slightly off in message-only mode). Consider conditional wording. Cosmetic; may be deferred.

## Observations (no action required)

- O1: `.Messages` bodies are computed but never embedded in any prompt (old and new); delivery is by directory pointer and the agent re-reads files. Consistent; just recorded so nobody assumes inline delivery.
- O2: TEAM-wide messages (`-TO-TEAM-`) match NEITHER agent's `-TO-$Agent-` filter (pre-existing scope, verified E3/E4). If team-wide delivery is ever wanted, that is a separate enhancement, not this patch's bug.
- O3: Activation timing — live parents (Sep-30 start) run old code; first new-behavior prompt appears only after natural parent reload. Any "delivery now proven" claim must be tied to a post-reload cycle, not to this patch landing. (The NVIDIA OWNED REVIEWED ack traveled via the pending-file recovery mechanism, not this code path.)

## Evidence paths (all in Muse workspace unless noted)

- tmp/verify-msgdelivery/Test-WorkerMessageDelivery.muse-rerun.ps1 (1-line $root redirect; diff recorded in cycle log)
- tmp/verify-msgdelivery/run-rerun.ps1
- tmp/verify-msgdelivery/run-20261003T105738471/results.json (16/16 new)
- tmp/verify-msgdelivery/run-20261003T105859088/results.json (10/6 old)
- tmp/verify-msgdelivery/edge-probes.ps1 + edge/edge-results.txt (5/5)
- Shared files read-only: coordination/muse-worker.ps1, coordination/nvidia-worker.ps1, both .before-message-delivery-20261003T104319400.bak, team/runtime/Test-WorkerMessageDelivery.ps1
- No worker files modified, no processes stopped, no Joe source delta, NVIDIA tree untouched (zero reads needed for this review).

## Ownership / next

- Implementation owner stays Codex (coordination-only). C1 can land as fast-path with proportional review; no Muse re-review required after C1.
- Both CRITICAL human objectives remain OPEN and retain highest priority; this coordination repair does not advance or block them.
