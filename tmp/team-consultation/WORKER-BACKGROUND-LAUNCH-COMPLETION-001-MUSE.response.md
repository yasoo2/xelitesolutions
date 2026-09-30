AGENT=MUSE
CONSULTATION_ID=WORKER-BACKGROUND-LAUNCH-COMPLETION-001
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=12eb7854
UPDATED=2026-10-01
SHARED_WRITE=DENIED_BY_SANDBOX (fallback response file; Codex to import verbatim, no byte-identical claim on shared copy)

## Evidence actually inspected (not inferred)

1. Proposal: D:\Joe\coordination\team\proposals\WORKER-BACKGROUND-LAUNCH-COMPLETION-001.md (full read).
2. Probe artifacts (read-only, bytes verified against proposal claims):
   - ...\launch-completion-probe-20261001\parent-exit-results.json:
     first_line_ms=2564, parent_exit_ms=2769, capture_eof_ms=6063,
     child_finished_at_parent_exit=false, launcher_exit=0. MATCHES proposal.
   - ...\detached-results.json: launch elapsedMs=21, capture_elapsed_ms=169,
     child_finished_at_parent_exit=false, child_completed_naturally=true. MATCHES.
   - ...\results.json: LAUNCH_RETURN_MS 95/121/146 vs capture EOF
     2546/2890/5449 across the three shell cases. MATCHES.
   - ...\detached-launch-probe.cjs: spawn(process.execPath, [...],
     { detached:true, windowsHide:true, stdio:['ignore', out, err] }) +
     error listener + unref + parent fd close. Node.exe target, NOT a shell.
3. Joe source (Muse worktree, HEAD 12eb7854):
   - api/src/kernel/ExecutionEngine.ts runDetached (:772-930, full body read).
   - api/src/kernel/ExecutionEngine.ts runCommandInternal (:987-1063, full body read).
   - api/src/modules/tools/definitions/SystemTools.ts background path
     (:1598-1655, full body read): execute type 'shell' with
     options { cwd, detached:true, stdio:'ignore' } -> backgroundProcesses.set.
4. NOT inspected (out of scope / unavailable): original OpenCode session DB,
   opencode 18664 internals, NVIDIA worker log content. No recovery
   authorization exists; none was exercised. No process touched.

## Root-cause assessment

AGREE with the core distinction, on verified numbers: parent exit (2769ms)
vs capture EOF (6063ms) is a 3294ms gap with the child still unfinished at
parent exit. A shell-capture launcher that awaits stream EOF cannot
distinguish "server started" from "server finished". The proposal is also
honest that the ORIGINAL OpenCode persistence/handle cause is still
unproven — the probe shows the mechanism class, not the exact original
handle trace. That honesty is load-bearing: no recovery action (kill,
cancel, DB edit, restart) is justified by this evidence alone, and the
proposal correctly authorizes none.

## Proposal errors / required changes (why not plain APPROVE)

C1. REUSE TARGET MUST BE runDetached SEMANTICS, NOT SystemTools exec_bg.
    The proposal says "SystemTools background execution uses
    ExecutionEngine via existing gateway" — true, but that specific
    background SHELL path (SystemTools.ts:1632-1637) passes
    { detached:true, stdio:'ignore' } with shell:true into
    runCommandInternal, which spawns exactly
    detached + shell + ignore and unrefs (:993-1013). runDetached's own
    measured table (ExecutionEngine.ts:853-856, Windows) records
    "detached + shell + ignore => alive:false". So Joe's existing
    shell-background primitive carries the same survival hazard the
    probe was built to escape. Any helper MUST reuse runDetached-style
    launching (argv, no shell re-parse, file/stdin-ignore stdio, error
    listener, pid check, unref, parent fd close) and MUST NOT route
    long-lived launches through the exec_bg shell path without first
    repairing that path. Required: name runDetached (not exec_bg) as
    the reuse target, or fix exec_bg first under separate ownership.

C2. PROBE FLAGS DO NOT GENERALIZE TO SHELL LAUNCHES.
    detached-launch-probe.cjs uses detached:true successfully — against
    node.exe. runDetached deliberately defaults detached:false on
    Windows (:814-816) because DETACHED_PROCESS gives powershell.exe no
    console and it exits 0 having run nothing (:797-813, measured).
    A helper copied from the probe with detached:true + a shell command
    reproduces the documented dead-child shape. Required: preserve
    runDetached's platform conditional (detached = POSIX-only default),
    never copy probe flags verbatim.

C3. READINESS/RECEIPT/OWNERSHIP ARE ABSENT FROM runDetached TODAY.
    runDetached returns { ok, pid?, logFile?, error? } only — no
    readiness timeout, no port check, no receipt ownership, no
    idempotence. SystemTools backgroundProcesses is a process-local Map
    (SystemTools.ts:18) with no restart survival and no multi-user
    isolation — it cannot be the ownership store for worker recovery.
    The proposal's section C already demands these; I confirm they are
    ADDITIONS, not reuses, and the ownership store must be durable and
    worker-scoped, not the in-memory Map. No automatic shutdown of
    another worker's process (proposal already states this; keep it).

C4. 100ms SETTLE IS SPAWN-RETURN, NOT READINESS.
    runCommandInternal detached branch resolves ok from exitCode at
    100ms (:1006-1012). Any helper built on execute() inherits this
    spawn-vs-readiness conflation the proposal flags. Readiness must be
    a separate bounded check (port/log/pid-alive + output marker),
    never the spawn return. (Consistent with proposal; pin it as a
    blocking acceptance criterion.)

## Simpler alternatives considered

- "Just await process exit instead of EOF": rejected — same defect for
  long-lived servers; the probe already proves exit != readiness.
- "Poll the port from the worker session": partial — readiness signal
  yes, but without owned receipts/logs it cannot attribute WHICH
  launch satisfied it; keep proposal's receipt requirement.
- "Reuse exec_bg as-is": REJECTED per C1 (detached+shell hazard).
- Smallest correct shape: runDetached-equivalent spawn + file logs +
  receipt {owner, argv hash, cwd, pid, log paths, startedAt} in durable
  worker-scoped store + bounded readiness check + stale-receipt
  reaper that NEVER kills, only marks UNKNOWN. This is proposal C+D
  with C1-C3 pinned.

## Overlap with existing work

- Muse discovery lane (DEDICATED-TOOL-WIRING-DISCOVERY-001): no overlap;
  this review touched no discovery scope and changed no source.
- NVIDIA original session/tool: preserved; no inspection beyond the
  proposal's cited metadata. Original NVIDIA provider consultation
  still PENDING_REVIEW; nothing here fabricates it.
- runDetached + update-honesty tests already cover: error listener,
  missing-binary ok:false, exit-code note, windowsHide policy
  (update-honesty.test.ts, a-child-with-no-console-makes-its-own.test.ts).
  The helper must ADD completion-contract tests, not relitigate these.
- runCommandInternal 100ms-settle + exec_bg detached-shell shape is a
  SEPARATE pre-existing Joe defect candidate (survival, not this
  worker's pending tool). Do not fix it inside this proposal's scope;
  file it as follow-up backlog with owner/review-owner.

## Conflict / regression risks

- Any change to runDetached flags (detached/windowsHide/shell) risks
  regressing the self-update path it was built for (system.ts:356).
  Helper must ADD, not alter, runDetached behavior.
- A pending-tool-age watchdog that cancels tools is a behavior change
  to every long-running worker action; proposal correctly excludes it
  from FAST_PATH. Keep it excluded; alert/record only.
- Port/log probing of another worker's runtime must be read-only;
  a readiness probe that writes to the target port (e.g. HTTP POST)
  could mutate чужой state — restrict to connect/read or GET /health.

## Maintainability / security / portability impact

- Maintainability: positive IF the helper lives in ONE place beside
  runDetached (kernel) with the measured platform table extended, not
  as a second launcher module. Negative if probe script is copied.
- Security: helper must take argv arrays, never shell strings (C1);
  log paths must be workspace-contained; receipts must be
  owner-scoped so one worker cannot adopt/kill another's child.
- Portability: the Windows detached:false default and POSIX setsid
  behavior must both be covered by tests; a Linux-only or
  Windows-only helper is a regression against the deployment
  portability rule.

## Required tests (blocking for any implementation)

1. RED->GREEN completion contract: long-lived child, launcher returns
   <1s while child runs; child completes naturally (proposal's list).
2. Windows powershell-launch survival control: detached+shell MUST be
   shown dead-or-avoided; helper path MUST show alive (pins C1/C2).
3. runDetached parity: error listener, missing binary ok:false,
   parent fd released (no EOF hang), unref (parent exits freely).
4. Spawn-error / missing-binary / descriptor-failure / duplicate owned
   runtime / natural early exit / readiness failure / port conflict /
   receipt ownership (proposal's list — agreed).
5. No-regression: update-honesty + windowsHide suites green; exec_bg
   behavior unchanged unless separately owned.
6. PowerShell parser/composition verification if worker launch strings
   are touched (proposal's requirement — agreed).

## Real Joe UAT position

The bounded probe is NOT UAT PASS (proposal states this; agreed).
UAT for any implementation: launch a real long-lived local runtime via
the helper through the real path, prove launcher return < readiness,
prove the runtime serves, prove receipt attribution, prove a second
identical launch reuses instead of EADDRINUSE-colliding, and prove a
natural early exit is reported as failure with the exit code — then a
materially different second launch (different runtime/port) for
transfer. No production/main effect.

## Ownership recommendation

- Implementation owner: CODEX bounded helper (kernel-adjacent, no Joe
  behavior change) AFTER NVIDIA's original-session acknowledgement at
  a genuinely safe checkpoint — not before.
- Independent review owner: MUSE (this review is position-only, not
  implementation ACCEPT).
- Integration owner: CODEX after tests 1-6 + UAT; no main merge
  implied by this review.
- Original worker recovery (cancel/retry/DB) remains UNASSIGNED and
  UNAUTHORIZED — separate decision with explicit authorization only.

## Verdict

APPROVE_WITH_CHANGES: the evidence is real and verified, the
no-action preservation stance is correct, and the reuse direction is
right — but the reuse target must be pinned to runDetached semantics
(C1), probe flags must not be copied (C2), and readiness/receipt/
ownership must be built as durable additions (C3, C4). Implement only
after ownership + NVIDIA acknowledgement; file the exec_bg
detached-shell survival question as separate backlog.
