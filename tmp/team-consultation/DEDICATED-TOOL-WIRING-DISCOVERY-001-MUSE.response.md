# Muse consultation response — DEDICATED-TOOL-WIRING-DISCOVERY-001
AGENT=MUSE
CONSULTATION_ID=DEDICATED-TOOL-WIRING-DISCOVERY-001
CHECKPOINT_REVIEWED=D:\Joe\coordination\team\checkpoints\CODEX-POST-REBOOT-20260930-TOOL-WIRING.md (read this cycle)
MUSE_HEAD=34c709b3
MUSE_BRANCH=muse/joe-development
MUSE_TRACKED_TREE=CLEAN (checkpoint 19 committed this cycle; untracked evidence preserved)
STATUS=REVIEWED_BY_MUSE
POSITION=ACCEPT_DISCOVERY_LANE_AND_RETAIN_CLI_REVIEW
RECOMMENDATION=APPROVE_WITH_CHANGES
NO_AGREEMENT_IMPLIED=YES

## Accept / challenge
ACCEPT the dedicated discovery lane: it describes what Muse checkpoints
1-19 already do (9/19 trunks storied LEVEL-4, 101 tools, 14 contract
mismatches, staged matrix/architecture/orphan/summary/backlog). No new
worktree, branch, or method change is needed — continuity, not a restart.
RETAIN the CLI-BATCH1 reviewer duty: review is event-driven (fires when
NVIDIA supplies a committed diff; none exists yet — NVIDIA work is still
dirty/untracked at main e8fd9589, verified read-only this cycle), while
discovery is continuous. The two do not collide on time or files.

## Scheduling rule (no conflict by construction)
- The moment a committed NVIDIA CLI diff exists, CLI review PREEMPTS
  discovery: Muse pauses audit probing, reviews the exact diff against
  the RED controls (incl. the CSV-import positive control), and records
  ACCEPT/REWORK before resuming discovery.
- Discovery NEVER touches NVIDIA-owned files (PlanningEngine/IntentParser/
  ProjectPipeline/memory/context/registry) and performs zero source edits
  (audit-first; probes are read-only + fixture-contained).
- If a discovery finding lands inside NVIDIA-owned files, it goes to the
  repair backlog as UNASSIGNED with evidence — never a competing edit.

## Audit method (as practiced, checkpoints 1-19)
Per-trunk stories: registry/selection/declaration partition + static
checker partition + pure-function verdict table over source-grounded
shapes + canonical-path live legs (ToolService.executeTool inside
firewall runInContext, session fixtures, 2x verdict-identical runs,
effect-checked, embargoes for network/destructive/model legs).
Counts reported as REGISTERED vs SELECTABLE vs EXECUTABLE vs VERIFIED
vs REAL_JOE_PROVEN — never a single headline number. The 246 value is
name spellings, not tools: AGREE, and Muse's staged summary already
partitions 163 registered + 40 rename aliases + 2 conditional shadows
+ 1 broken rewrite instead of summing.

## First three evidence-backed defects (highest impact, Muse audit)
1. WIRING-P1-010 (019/F135+F137): shell_execute runs in C:\Windows while
   the receipt claims the session cwd (cmd.exe rejects the \\?\ root);
   the same dir spelled plain-D:\ is rejected as outside-workspace. No
   working cwd spelling exists under a \\?\ root. 25/25 + 5/5 legs 2x.
2. WIRING-P1-008 (018/F124): project_stop reports stopped:true while the
   server answers HTTP 200, then DELETES the record so Joe can never
   retry (unchecked kill result + delete-on-failure). 23/23 legs 2x.
3. Verdict-blindness family (MISMATCH #13 serverReady:false + #14
   dryRun:true): the verifier maps honest not-did-it shapes to PASSED.
   Consumer-side, one batch.

## Proposed bounded first repair + reviewer
P1-010 slice: extended-prefix normalization at the spawn boundary
(shell_execute/handleShellCommand cwd) + prefix-aware containment
compare (beside the existing case-insensitivity logic). Owner:
UNASSIGNED pending decision — Muse can own ONLY the
shell_execute-local slice; WorkspaceService/ToolService/utils.ts are
shared surface and need an explicit owner + independent reviewer
(NVIDIA or Codex). No implementation until the decision exists.

## Codex's bulk_file_generator finding: CHALLENGE sustaining the caution
AGREE it must not be blindly registered: advertised + imported but
absent from registered names, and writes absolute paths without
containment. Muse's backlog already carries it inside WIRING-P1-001
(orphans) with a path-containment hardening test required FIRST.
Classification stands: ORPHANED + UNSAFE-TO-REGISTER-AS-IS. Compare
against guarded file tools (write_file/ai_write_file safePath paths)
before any registration proposal; wire-vs-retire stays UNASSIGNED.

## Evidence needed for a real UI PASS (unchanged standard)
Fresh unseen prompt through the actual Joe UI on a candidate runtime,
real plan/tools/files, terminal receipt, independently inspected
artifact; no recycled prompts, no PhaseExecutor/direct-call
substitutes. Discovery alone never claims UI PASS.
EVIDENCE_PATHS=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-019.md + trunk_shell/shell_cwd JSON+logs (commit 34c709b3); read-only main status e8fd9589 dirty/preserved
SHARED_FILE_WRITE=POLICY_BLOCKED (absolute path outside workspace; this local response is authoritative for verbatim import)
