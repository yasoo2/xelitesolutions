# MUSE WIRING DISCOVERY 049 — registry headline-count cross-review (Muse vs main)

FOLLOWS=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-048.md
HEAD_MUSE=5497183a MAIN=e8fd9589 working tree (read-only, dirty preserved, untouched)
ENV=source-read + byte-diff + regex probe only; zero Joe imports, no provider calls,
no source edits anywhere. (muse.search is workspace-confined; main-tree evidence
uses powershell grep + read_file + git diff --no-index.)
SUBJECT=Independent Muse cross-review of JOE-WIRING-AUDIT-SUMMARY.md headline
counts (REGISTERED 164 / EXECUTABLE 163 / spec-tool boot-block claim).

## F52 verdict: REGISTERED counts RECONCILED (163 Muse / 164 main)

- Muse registry.ts vs main working registry.ts: EXACTLY +2 lines
  (git diff --no-index, 2 insertions, 0 deletions):
  import { SpecificationVerificationTool } + createTool(SpecificationVerificationTool).
- Muse live boot log (run31, committed dist from f85966bb, zero api/src+web/src
  drift to HEAD): "[ToolRegistry] Registered 163 tools".
- Main = Muse set + specification_verification (name unique in file:24, no
  collision evident) => 164. Matches summary's REGISTERED_TOOLS=164.
- SpecificationVerificationTool.ts ABSENT from Muse tree (Test-Path False);
  present in main as untracked NVIDIA work (352 lines, SHA256
  0d1026e3807cd98d0574bd53e7bb2dd11a31994248d82024596fd857757982dd,
  stable since 9/30 7:08 AM -- not mid-edit during this inspection).
- Caveat: revived-tool set equality between trees assumed from the 2-line
  registry delta (revivedTools block identical); per-name revived census is a
  follow-up, not claimed here.

## F53 verdict: "spec tool BLOCKED by ExecutionEnforcer" is STALE -- CHALLENGE

Summary claims (finding #2, EXECUTABLE=164-1, boundary table):
"SpecificationVerificationTool BLOCKS MAIN BOOT: uses execSync directly...
ExecutionEnforcer rejects at startup" and "PLANNER_VISIBLE_NOT_EXECUTABLE=1
(blocked by ExecutionEnforcer)".

Current-source evidence contradicts the mechanism:
- Spec tool file contains NO execSync, NO child_process import, NO spawn,
  NO require( (powershell grep, exit 1 = zero matches, full 352-line file).
- Boot-scan simulation with ExecutionEnforcer's EXACT regexes
  (spawn/exec/import patterns from kernel/ExecutionEnforcer.ts:82-85):
  spawn_match=False, exec_match=False, import_match=False
  (probe: tmp/wiring-audit/probe-enforcer-spec.py). The boot scan CANNOT flag
  this file; "SYSTEM STARTUP BLOCKED" will not trigger from it.
- runTests (spec file:320) routes via executeTool('shell_execute', ...) --
  the summary's own prescribed remediation is ALREADY DONE in current main.
- ExecutionEnforcer.enforce() (:115-127) is a stack-routing guard (throws only
  when ExecutionEngine is absent from the stack), NOT a per-tool blocklist.
  No mechanism in it blocks 'specification_verification' specifically.
- Main :5000-family APIs boot and serve health with this file present
  (observed runtime state this cycle window), consistent with no boot block.

RECLASSIFICATION (Muse position): specification_verification is REGISTERED and
EXECUTABLE in current main, but NEEDS_REWORK -- its verdicts are untrustworthy,
not its wiring blocked. Corroborated remaining defects (agree with Codex
SPECIFICATION-VERIFICATION-EVIDENCE-001 independent review):
  a. Keyword false-success: 30% keyword overlap certifies PASS (:268-274);
     empty requirements => coverage=1 => verified=true (:134-136).
  b. Generic `npm test` ignores the selected testFiles (:320-324).
  c. runTests drops context/userId propagation (:344 passes no context).
  d. findTestFiles/spec lookups have no located production callers (Codex
     UNVERIFIED_WORK stands; not re-proven here).
REPAIR-BACKLOG INPUT: summary finding #2 / backlog item "route spec tool
through executeTool" is DONE-obsolete; replace with a-c (+ identity persistence
per Codex proposal) under the existing NVIDIA-owned specification scope. Owner
of that scope UNCHANGED (NVIDIA draft owner per team state). No edits by Muse.

## F54: workspace-resolution finding LIVE-CONFIRMED (second instance)

Spec tool runTests (:314): workspaceService.getActiveRoot() WITHOUT
contextWorkspaceId -- the exact pattern AGENTS.md rule 16 forbids and the
summary's boundary table lists. The tool receives no workspaceId in input or
context, so no caller can supply it today: the defect is structural to the
tool's contract, not a one-line call-site fix. Same repair batch as F53(c).

## Planner visibility of specification_verification

- `specification_verification` occurs 0 times in BOTH trees'
  api/src/core/orchestrator/toolCatalog.ts (grep -c = 0/0).
- Main classification: REGISTERED_NOT_PLANNER_VISIBLE (joins the ~20 class;
  exact class recount not attempted this cycle). Even if its verdicts were
  trustworthy, autonomous Joe would not select it today.

## Counts (this checkpoint)

REGISTERED_MUSE=163 (live boot log, run31)
REGISTERED_MAIN=164 (163 + spec_verification, 2-line exact delta)
EXECUTABLE_MAIN_CLAIMED_BY_SUMMARY=163 (via "spec blocked")
EXECUTABLE_MAIN_MUSE_POSITION=164 tools executable at the gate level, with
specification_verification verdict-NEEDS_REWORK (executes, untrustworthy).
CHALLENGED_SUMMARY_CLAIMS=1 mechanism (boot-block), with replacement evidence.
CORROBORATED_SUMMARY_CLAIMS=1 (workspace getActiveRoot boundary, 2nd instance).
CORROBORATED_CODEX_CLAIMS=keyword false-success shape, generic npm test.
UNKNOWN opened: U049-1 = per-name revived-set equality between trees
(NEXT: static name census script or dual-boot log capture; NOT run this cycle
to avoid extra runtime cost during the provider outage window).
UNKNOWN closed: none (048 closed its own).

## Method note (permanent)

muse.search silently returns empty for absolute paths outside the Muse
worktree (observed 2x on main-tree files this cycle). Main-tree content
evidence in this checkpoint comes from powershell grep / read_file /
git diff --no-index only. Future checkpoints must not cite a muse.search
empty result on main-tree paths as negative evidence.
