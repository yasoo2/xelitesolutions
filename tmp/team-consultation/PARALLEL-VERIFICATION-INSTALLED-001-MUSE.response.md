AGENT=MUSE
CONSULTATION_ID=PARALLEL-VERIFICATION-INSTALLED-001-MUSE
PROPOSAL=proposals/PARALLEL-VERIFICATION-LEDGER-001.md
STATUS=REVIEWED_BY_MUSE
POSITION=ACCEPT_CONDITIONAL (installed diff on exact hashes; design contract fully met; integration gated on remaining gates + UAT + main-hunk reconciliation)
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=cb227faa
MUSE_BRANCH=muse/joe-development
REVIEWED_AT=2026-10-01T07:40Z (approx; installed evidence as of 07:39Z)
SHARED_FILE_WRITE=DENIED_BY_SANDBOX (expected; absolute path outside workspace). This fallback file is the authoritative Muse review for Codex import. Do not mark shared STATUS changed until Codex imports.
CANDIDATE=D:\Joe\worktrees\codex-nvidia-provider-ui (read-only inspection; nothing modified, no process started/stopped)

## Exact hashes verified by Muse (Get-FileHash, this cycle)
- PhaseExecutorTool.ts (installed) = B6271EE1FE071A00BBD21EDB835EB13EB2096D27C28AD5C3FE9C8CF1A1220F21 MATCHES consultation
- parallel-verification-ledger.ts (new helper) = B67B714D9AD90ACFADDE38E2F35D559819EA6E30F9E831988182FC608E9E8284 MATCHES
- PhaseExecutorTool.before.ts (backup) = AA817572E67DEB20E5F81BB91B2506E724F16A9AE0D1CE6487B5F442BFD610C8 MATCHES pre-install hash cited in team state
- parallel-verification-ledger.test.ts = 600425C0BB87AE11D1917AC32DD868F494B2A8A395DCD7B1EA809E9F5B4B9EEC MATCHES manifest
- parallel-verification-merge.test.ts = 331D26FF1C2F4BDBD16F9AF738105A616D981538B61AF822E39AE70A171648A8 MATCHES manifest
- checkpoint-current-contract.test.ts = 3ED79C76D07447C0AF60682653D4DCC4A0EF42B0D81F97ECB3E6955E7A108A8 MATCHES manifest
- Candidate HEAD = a0886aa4 MATCHES manifest BaseCommit; dirty scope = V5 ledger + PhaseExecutor + 3 pre-existing creative files (row-image, ImageGenerationTool, verify_pictures) preserved and excluded from this scope per manifest. No unrelated production edits in the installed batch.

## Installed diff inspected (git diff --no-index, backup vs installed)
PhaseExecutorTool: 34 insertions / 11 deletions, 6 hunks ONLY:
1. import mergeParallelVerificationLedgers (new helper).
2. nextLevel.includes(next) guard — shared DAG child scheduled once.
3. alreadyGrouped set — same-tool groups skip already-grouped stepIds (dedup at source).
4. buildExecutionGroups remainingIds filter (dedupe + processed + taskById guard) + handoff-producer sequential forcing (search_public_apis/validate_api/decide_capability_route via resolvePlannedTool) + order-preserving singleton split.
5. Sequential loop: resultStart fresh slice + requiredFailure (required/high + fresh ok===false) ORs shouldBreak. executeSingleTask untouched.
6. Parallel path: frozen compactVerificationLedger baseline passed to all branches; mergeParallelVerificationLedgers(baseline, branchLedgers); ALL settled branches collected (no early break); per-branch required/high fresh-failure stop flag; conflict result (tool phase_executor, ok:false, no completedCount increment) + stop.
No changes to executeSingleTask failure ladder, recordVerification call sites, checkpoint writing, planner IDs, workspace/root logic, or compaction. Out-of-scope pre-existing risks correctly untouched.

## ROOT CAUSE (Muse confirms installed correction addresses all four)
- R1 duplicate scheduling: FIXED at both emit (hunks 2-3) and consume (hunk 4) layers. Matches Muse A2; direction keeps level-grouping over same-tool (deviation from Muse preference, same defect effect — ACCEPTED, level grouping carries DAG intent).
- R2 snapshot overwrite: FIXED via frozen baseline + pure delta merge (hunk 6 + helper). Last-write-wins ledger assignment REMOVED.
- R3 required-stop bypass: FIXED at group level exactly per Muse A1 (fresh slice both loops; inner ladder untouched).
- R4 early break drops settled evidence (Muse finding): FIXED — aggregation loop has no break; shouldBreak is a flag honored after full collection (hunk 6). Sequential path breaks only after the task's own evidence is collected.

## P2 CHALLENGE (Muse independent verification — CLOSED, endorsed)
Muse verified by source read (installed file): the ONLY apiSelection/capabilityDecision mutation sites in executeSingleTask are lines 1693-1727, gated on normalized toolName === search_public_apis / decide_capability_route / validate_api, where toolName = resolvePlannedTool(askedFor).tool (line 1401/1409). The grouping forcing check (line 1280-1282) uses the SAME normalizer. Therefore: (a) producer set is exhaustive, (b) alias spellings are covered consistently at grouping and execution, (c) non-producer parallel branches return these fields unchanged so retained last-write-wins at lines 2247-2248 is harmless. Proven by tests: api-selection handoff both orders + consumer pass-through, capability-decision both orders, validate-UNAVAILABLE blocker + stop. The parallelism cost (producer groups serialized) is a correct fail-safe tradeoff; disjoint-selection merging is future work, NOT required. No arbitrary winner, no re-compaction of compacted decisions.

## PROPOSAL ERRORS / deviations (none blocking)
- D1: Dedup direction keeps level groups instead of same-tool (see R1). Acceptable, tested.
- D2: repair-gates runner omits test:self-fix:typescript-argument-coercion and test:self-fix:typescript-string-to-boolean (both AGENTS.md-required). Must run before integration.
- D3: 8-suite regression (96/96) ran against the 15-case ledger suite; the 16th case (thrown sibling) is covered only by final-phase 16/16. Recommend one combined rerun for a single simultaneous green.
- D4: Independent Codex critic ACCEPT is claimed in consultation/manifest but its artifact is not in shared team state (not found under team/). Muse's ACCEPT does not rely on it.

## SIMPLER ALTERNATIVES
Muse A1 (group-level required-stop) and A3 (pure helper reusing compaction, called at orchestration boundary) are EXACTLY what is installed. No simpler correct alternative exists for R2 (any fix must delta-merge); R1 two-layer dedup is minimal (either layer alone stops the observed double execution; both together remove the redundant group at source). Endorsed as implemented.

## OVERLAP WITH EXISTING WORK
- Muse ledger-module work (5900fc94 strict receipt/live-env/manifest guard; c71f6d81 observation function): orchestration-layer batch reuses compaction; no duplication, no conflict. Muse branch untouched by candidate. No competing Muse implementation.
- NVIDIA dirty main (PhaseExecutor 3-line verification-args logging hunk ~line 2328; ledger 27 lines; plan-tools 114 lines; spec/CLI work): NOT in candidate; regions are outside installed hunk ranges (low merge risk) but reconciliation is REQUIRED at integration — no overwrite authorized.
- Codex V5 ledger/resume + one-attempt + provider batches in same candidate: separate reviewed scopes; this review covers ONLY PhaseExecutor B627 + helper B67B + the 4 permanent test files.

## CONFLICT / REGRESSION RISKS
- C1-C4 (Muse design review): all closed by permanent tests (see below). Counter-suffix exactness verified by Muse read: new decisions == select-call count == selected+invalidated+reused deltas; eviction triggers historyUncertain fail-closed.
- C5 (stop-shape change for AgentLoop/self-fix callers): engineer-flow PASSED on installed source with exact-count assertions (file_edit then phase_executor; one repair + one completed rerun; smoke-once/final-once trace). No silent reinterpretation observed.
- NEW failure shape `parallel_verification_conflict:<ids>` (ok:false, tool phase_executor): honest stop, strictly better than prior silent false-pass. Self-fix behavior on this shape is unobserved — integration-watch item, NOT a blocker (no conflicts occur in the engineer-flow path).
- Checkpoint-completed-before-outcome, double-record-after-exception, non-idempotent phase-entry compaction, duplicate planner IDs: confirmed UNTOUCHED by this diff; remain separate backlog. This batch claims none of them.

## MAINTAINABILITY / SECURITY IMPACT
- Positive: +84-line pure helper (deterministic, branch-order, no clock/random/fs/globals/secrets) + 34-line bounded orchestration change; no new services/registries/config; merge reuses compactVerificationLedger (Muse review gate SATISFIED — no second ledger truth).
- Workspace isolation: no path/root/workspace logic touched; per-run ledgers only. Multi-user/portability safe.
- Fail-closed everywhere conflicts/uncertainty can arise; counters saturate with complete=false.

## REQUIRED TESTS — status at review time (07:39Z)
Muse T1-T12: ALL GREEN on installed source (verified result JSONs, not inferred):
- T1/T2/T3/T9/T10: final-phase 16/16 EXIT0 28.441s (echoFirst both, baseline-once+immutability, thrown+returned siblings with quality_run EXACTLY 2, required-parallel stop).
- T4-T8: merge suite 15/15 within regression 96/96 (same-check both orders, fingerprint conflict, no-resurrection, 111/96 cap, overflow/negative, +5 adversarial).
- T9 also: dedup unit + shared-dependent unit. T10/T11: required sequential both recoverable values (top-level flag fixture) + optional-then-required no-false-stop.
- T12: 8 suites 96/96 EXIT0 166.363s (api-handoff 5, capability-handoff 2, merge 15, ledger 15, ledger-core 30, restart 3, checkpoint-13, change-aware 13). NOTE D3 staleness (15 vs 16 ledger cases).
- T13 AGENTS gates: 6/12 GREEN (guard:architecture, guard:package-scripts, engineer-flow PASSED with exact counts, build-context rerun, execution-safety, typescript-repair); 4 RUNNING (missing-name, number-to-string, self-healing failure/success — runner live at review time); 2 NOT IN RUNNER (argument-coercion, string-to-boolean — D2). tsc --noEmit EXIT0 and api build EXIT0 per manifest (Muse did not re-run; build log not in shared dir — trust-but-verify at integration).
- T14: engineer-flow negative-shape assertions GREEN; self-healing negative suites = the RUNNING gates above.
CONDITION: T13/T14 completion (all 12 AGENTS gates incl. D2) is REQUIRED before any integration proposal. No test weakening observed anywhere (RED artifacts preserved).

## REAL JOE UAT (required before integration; BLOCKED, unchanged)
U1/U2/U3 (parallel receipt preservation / required-fail stop / changed-source resume on real :5002) NOT RUN. Blockers: (a) official :5002 backend-refresh authorization unanswered; (b) recent provider instability (Muse run30-33 LLM 429s/local timeouts). Mocked-gateway suites are NOT UAT. No product PASS, no main merge, no GitHub-hash claim authorized by this review.

## OWNERSHIP / DECISION
- IMPLEMENTATION_OWNER=CODEX (isolated candidate only) — complete for this scope, no further code changes required by Muse.
- REVIEW_OWNER=MUSE — this file is the installed-diff review. ROLE_ACCEPT (design) fulfilled.
- CRITIQUE=NVIDIA independent installed review still PENDING — REQUIRED before integration.
- INTEGRATION_OWNER=CODEX only after: (1) all 12 AGENTS gates green incl. D2 + D3 combined rerun, (2) NVIDIA installed review recorded, (3) U1-U3 Real Joe UAT pass on authorized runtime, (4) main dirty-hunk reconciliation (NVIDIA observation/logging + plan-tools + spec work preserved).
- REVERSIBLE=YES (isolated candidate; no main/production action).
- CODEX_REVIEW_ON_RETURN=N/A (Codex authored; independent critic ACCEPT claimed but artifact not shared — D4).

## CONDITIONS (why APPROVE_WITH_CHANGES, not unconditional APPROVE)
1. Complete the 4 running gates; ADD the 2 missing TS gates (D2) and report.
2. One combined regression rerun covering the final 16-case ledger suite (D3).
3. No main merge / API refresh / production action until NVIDIA installed review + U1-U3 + reconciliation.
4. Preserve the new `parallel_verification_conflict` failure shape through integration (no silent reinterpretation).

## LIMITS OF THIS REVIEW
- Inspected: installed diff (full), helper (full), both phase/merge suites (full), result JSONs (counts + key assertions), gate logs (tails), candidate git status/log, main dirty stats, manifest. Muse did NOT re-execute tests (Codex runner live; no competing execution), did NOT re-run tsc/build, did NOT inspect Codex private artifact root.
- CRITICAL commands retain priority; this review consumed the safe checkpoint without starting competing implementation. No Muse/NVIDIA/Codex work modified, stopped, or restarted.
