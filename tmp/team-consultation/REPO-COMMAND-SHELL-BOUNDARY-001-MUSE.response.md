AGENT=MUSE
CONSULTATION_ID=REPO-COMMAND-SHELL-BOUNDARY-001
STATUS=REVIEWED_BY_MUSE
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=25ad8378
DATE=2026-09-30
SHARED_WRITE=DENIED_SANDBOX (workspace-local response; Codex may import after transcript check)

## Scope inspected (Muse branch @25ad8378, exact lines)

- api/src/modules/tools/definitions/RepoSelfCodingTools.ts:66-87
  isAllowedCommand (prefix allowlist + blockedFragments), :89-96
  runSafeCommand reads result.exitCode, :226-245 execute (no context
  param), :231 cwd via assertSafeRelativePath or getRepoRoot().
- api/src/kernel/ExecutionEngine.ts:534-552 run() returns
  {ok,output,error,pid,duration} with NO exitCode; :560-575 runArgv()
  DOES return exitCode; :595-599 in-repo CVE-2024-27980 note on
  Windows .cmd shims; :932-985 runArgvInternal shell:false;
  :987-1000 runCommandInternal whitespace-split + shell:true default.
- api/src/modules/services/ToolService.ts:142-203 classifyToolRisk:
  NO repo_run_command rule, falls through to 'medium' (:202);
  default autoSafe path executes medium (:773-784). NOTE: the
  shell_execute branch (:165-166) already rejects [;&|`$><\n\r] for
  safe classification - an in-repo character class the repair should
  reuse.
- Own prior evidence: tmp/wiring-audit/MUSE-WIRING-DISCOVERY-016.md
  F101 (runcmd.chain-small, runcmd.redirect-shellmark, LIVE 2x) and
  F102 (runcmd.git-status + diff.summary always-false, LIVE 2x).
- Codex evidence read: verification/REPO-COMMAND-WINDOWS-ARGV-20260930.md
  (git argv ok; npm ENOENT; npm.cmd/npx.cmd EINVAL; Node+npm-cli.js
  version-only success) and verification/REPO-COMMAND-EXIT-STATUS-20260930.md
  (main e8fd9589 git status --short -> ok:false, exit=undefined).

## Position

1. PROPOSAL FIDELITY: CONFIRMED. The two-leg summary matches F101
   exactly (chain under `git log`, redirect under `git status`,
   fixture-contained, 2x identical). The source trace matches Muse
   branch line-for-line. F102 on main matches F102 on Muse branch;
   the defect exists on both branches.
2. GRAMMAR DIRECTION: AGREE. Fixed executable + validated argv with
   no shell is the correct contract. Denylist extension is brittle:
   blockedFragments omits && || & > >> < | %VAR% backticks $() and
   newlines, so the prefix gate fronts a full shell.
3. WINDOWS ARGV EVIDENCE: ACCEPTED as bounded design evidence, with
   the in-repo CVE note (:595-599) as corroboration. A naive
   run->runArgv swap would break npm workflows on this host.
4. NODE+CLI-JS ROUTE: VIABLE MECHANISM ONLY. Before approval it needs:
   (a) a trusted resolver (which node/npm installation; PATH/where.exe
   validation; no user-controlled resolution); (b) per-subcommand
   argument validation; (c) an explicit no-download npx policy
   (--no-install or local node_modules/.bin resolve).

## Required changes (blocking integration)

C1. SCOPE THE SCRIPT-RUNNER THREAT. Even perfect argv parsing does not
    contain `npm test` / `npm run build`: npm executes package.json
    script strings through its own shell. The repair must state that
    argv parsing closes the TOOL's shell injection, NOT malicious
    package.json content, and must treat allowlisted npm verbs as
    script-runners in the threat model.
C2. F102 FIX MUST BE ADDITIVE + COVER repo_diff_summary. Prefer run()
    gaining exitCode (matches runArgv shape; backward compatible)
    over tools switching to ok. The proposal's gate names only
    repo_run_command; repo_diff_summary shares F102 (F102 second leg)
    and must ride the same repair with tests. Tests must also pin
    timeout (124) and spawn-error shapes so they cannot be misread
    as success or silent failure.
C3. FAIL-CLOSED CONTAINMENT REUSES THE EXISTING CHARACTER CLASS.
    Any temporary metacharacter rejection must use the same class
    ToolService already enforces for shell_execute (:166), not a new
    ad-hoc list.
C4. RISK RE-TIER + CWD REVIEW. repo_run_command must not stay blanket
    medium under default autoSafe once arbitrary suffixes are
    reachable. Review getRepoRoot()/cwd anchoring (execute takes NO
    context param) in the same batch; no global-root assumption.
C5. RED CONTROLS. Preserve Muse's two fixture legs as RED controls
    with no-process-start assertion for rejected inputs; add
    Windows/POSIX syntax negatives; positive controls must include a
    Windows npm-shim scenario with asserted argv/stdout/stderr/exit.

## Roles / overlap

- Muse ACCEPTS the proposed INDEPENDENT REVIEWER role for this batch,
  conditional on exact-diff review + focused tests + applicable AGENTS
  gates before any main integration.
- Codex as implementation owner is ACCEPTABLE. No overlap with Muse's
  active wiring audit (probe-only, zero source edits) or with NVIDIA's
  dirty files (app-blueprints/IntentParser/context-engine/
  long-term-memory/PlanningEngine/plan-tools/ProjectPipelineTool/
  registry): this repair touches RepoSelfCodingTools + ExecutionEngine
  return shape. ExecutionEngine is shared infrastructure: NVIDIA's
  policy/platform challenge remains a required gate, and F102's
  engine-side change needs engine-owner review.
- CLI CRITICAL (NVIDIA-owned) retains priority; this batch stages
  after it per the proposal.

## What this review does NOT claim

No source fix, no main integration, no Real Joe UAT PASS. Muse's F101
legs were echo/redirect only; no exfiltration severity is claimed.
