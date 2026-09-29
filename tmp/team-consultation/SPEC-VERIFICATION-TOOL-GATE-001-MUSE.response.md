# Muse independent review — specification verifier gateway

AGENT=MUSE
CONSULTATION_ID=SPEC-VERIFICATION-TOOL-GATE-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=CONFIRMED_GATEWAY_BYPASS_AND_MISSING_CONTAINMENT_PLUS_FIDELITY_GAPS
RECOMMENDATION=APPROVE_WITH_CHANGES
PROPOSAL=D:\Joe\coordination\team\proposals\SPEC-VERIFICATION-TOOL-GATE-001.md
MUSE_HEAD=eaafce80a4c2dc3c67172caded02197335709eeb
NVIDIA_BASE_READONLY=e8fd9589 (main, dirty EVAL-006 Phase 4 work; draft untracked)
UPDATED=2026-09-29 (this cycle; read-only review, no NVIDIA file modified)
SHARED_FILE_WRITE=DENIED (sandbox: absolute path outside workspace; shared file
left PENDING_REVIEW for verbatim import)

## Scope and method

Read-only review of NVIDIA's untracked draft
`api/src/modules/tools/definitions/SpecificationVerificationTool.ts` (347
lines), its pipeline call site (`ProjectPipelineTool.ts:2481-2514`), the spec
memory store (`long-term-memory.ts:363-407`), spec-ID generation
(`IntentParser.ts:395`), and the Muse-baseline gateway precedent
(`AutoTesterTool.ts:95-135,212,396`, `types.ts:1`,
`api/src/modules/tools/definitions` execSync usage). No NVIDIA file modified,
no live run interrupted, no command from the draft executed.

## Codex assessment check (all three core claims CONFIRMED)

1. False read-only classification — CONFIRMED. Draft lines 63-64 declare
   `permissions=['read']`, `sideEffects=['read']`, while `runTests` (lines
   310-320) runs `require('child_process').execSync('npm test',
   {cwd: projectRoot, timeout: 120000})`. An npm test script executes
   arbitrary commands, so read-only is false.
2. ToolService bypass — CONFIRMED. The shell action goes directly through
   `child_process`, never through `executeTool`/ToolService policy or shell
   authorization. `executeTool` is imported (line 2) but never called (only
   the import line matches). No tool definition in the Muse baseline uses
   `execSync`/`child_process` (zero matches across
   `api/src/modules/tools/definitions`; `execSync` exists only in kernel
   `ExecutionEnforcer`/`ExecutionGuard` and manual verify scripts), so this
   draft introduces a novel bypass pattern with no in-repo precedent. It
   violates the standing rule that ToolService is the policy/execution
   gateway for shell actions.
3. Missing workspace containment — CONFIRMED. `projectRoot` is only
   `path.resolve` + `existsSync` (lines 108-115). `workspaceService` is
   imported (line 3) but never used. The pipeline passes planner-derived
   input (`String(plannerResult?.output?.projectRoot || discoveredProjectRoot
   || '')`, `ProjectPipelineTool.ts:2490`) — model-influenced, untrusted —
   and the tool would `npm test` in any resolvable directory. Combined with
   (2), this is arbitrary command execution as the API user on an
   uncontained path. Blocker before merge or execution on user projects.
   This is source-level evidence, not proof any unsafe command ran.

## Additional independent findings (extend, do not contradict, Codex)

4. `runTests(testFiles, projectRoot)` ignores `testFiles` and always runs the
   FULL `npm test`. It is called once per requirement (line 202) AND once
   per acceptance criterion (line 339): O(requirements x criteria)
   full-suite runs, each a synchronous event-loop-blocking `execSync` up to
   120s on the shared API process. Availability/cost defect independent of
   the bypass. Criterion evidence is therefore "global suite green", which
   cannot attribute any single criterion (agrees with Codex fidelity note).
5. `userId` input is destructured (line 71) but never used. The memory store
   is keyed by `specificationId` only (`long-term-memory.ts:397`), and
   `getSpecification(specId)` (line 404) performs no ownership check, while
   `storeSpecification(userId, ...)` (line 363) records an owner. ID entropy
   is `spec_Date.now()_9xbase36` (`IntentParser.ts:395`, ~46 random bits:
   not practically guessable), so exploitation needs ID disclosure — but
   the missing check is still a latent cross-user spec-read defect
   (sourceText can hold proprietary requirements). Cheap defense-in-depth
   fix: compare `specMemory.userId` to the trusted context userId; note the
   pipeline currently defaults userId to `'anonymous'` (line 2491).
6. English-only evidence function blocks non-English specs. `extractKeywords`
   (line 257-265) lowercases, strips non-`\w`, requires length > 3 and an
   English stopword list; `contentMatchesRequirement` returns false on zero
   keywords (line 268). Arabic requirement text yields zero keywords, so
   every requirement fails with "No implementation found" and the pipeline
   fails closed (`finalVerified=false`, lines 2497-2505). Fail-closed is the
   safe polarity, but the tool as written can never pass an Arabic long
   spec — a generalization gap for EVAL-006. Evidence must come from
   executed checks/receipts, not keyword substring matching.
7. Gate polarity and placement are CORRECT and should be kept: the pipeline
   runs verification only `if (finalVerified && specification?.content)`
   after Browser QA (line 2481), and both `verified=false` and tool `ok=false`
   fail closed (lines 2494-2514+). The defects are the execution path,
   containment, ownership, and evidence quality — not the gate direction.

## Smallest safe correction (recommended order)

1. Contain `projectRoot`: resolve against
   `workspaceService.getActiveRoot(context.workspaceId)` with a
   relative-containment check; reject absolute/out-of-workspace roots and
   missing/untrusted session context, fail closed. (Follows the standing
   workspace path-resolution rule.)
2. Replace direct `execSync` with one delegated run through `executeTool`
   (`shell_execute` or `auto_tester`) carrying the full trusted owner
   context, per the `AutoTesterTool.ts:112-115,212,396` precedent (dropping
   userId must keep failing authorization). Run the suite ONCE per
   verification and map criterion evidence to executed checks, not to a
   repeated global green.
3. Declare truthful permissions: add `'execute'` (valid `ToolPermission` per
   `api/src/modules/tools/types.ts:1`) alongside `'read'`.
4. Enforce spec ownership: check `specMemory.userId` against trusted context
   `userId`; stop defaulting to `'anonymous'` on this path or treat it as
   untrusted explicitly.
5. Make requirement/criterion evidence language-neutral: executed-check
   receipts instead of English keyword matching, so non-English specs are
   verifiable rather than auto-failing.
6. Alternative (acceptable): make the verifier read-only and inspect
   existing trustworthy test receipts without executing commands, if a
   receipt-to-criterion mapping exists; otherwise defer this verifier until
   it does. Do not bypass ToolService for convenience.

## Required verification before integration

- Focused negative tests: out-of-workspace `projectRoot` rejected,
  missing/mismatched trusted context rejected, spec-owner mismatch
  rejected, no direct `child_process` path (static guard or mock assert).
- Positive in-workspace verification through the ToolService path (mocked
  `executeTool` asserting delegation + containment).
- Non-English spec does not auto-fail on keyword extraction.
- Applicable AGENTS architecture/self-healing gates; authorization and
  workspace-isolation checks; bounded timeout/output evidence.
- Real Joe UAT only after the stable integrated route exists. EVAL-006 and
  any product PASS remain unproven. Human CRITICAL CLI routing retains
  first priority.

## Ownership and limits

- NVIDIA owns the draft (active cycle27, dirty worktree); Muse proposes NO
  competing implementation and made NO edit to any NVIDIA file.
- No main merge requested or performed by Muse. No secret, credential, or
  live-process action taken.
- No Real Joe UAT applies to a read-only review; verdict is source-evidence
  only: UNIT/review-level, not product-verified.
