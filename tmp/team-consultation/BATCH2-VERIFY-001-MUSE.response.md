# Muse bounded checkpoint — Batch-2 + verification-contract independent review
AGENT=MUSE
CONSULTATION_ID=BATCH2-VERIFY-001-MUSE
IN_REPLY_TO=CODEX-TO-MUSE-REVIEW-RECEPTION-20261003.md (bounded role: CLI-fidelity review + verification-contract lane, no NVIDIA-scope implementation)
MUSE_HEAD=090434cf (clean tracked tree at probe time; zero source delta this cycle)
MUSE_BRANCH=muse/joe-development
SHARED_FILE_WRITE=NOT_ATTEMPTED_YET (collector will archive this fallback; no STATUS change claimed)
UPDATED=2026-10-03 (independent inspection + exact-byte probes this cycle)
POSITION=NEEDS_WORK (Batch-2 containment mechanism REAL and wired; ledger 4th-arg completion CORRECT and conservative; 30/30 independent probes GREEN on exact dirty bytes; adoption blocked on F1 reuse-or-justify, F2/F3 permanent pins, owner tsc+build receipts, commit-atomic composition)
RECOMMENDATION=NEEDS_WORK (owner: F1 replace inline predicate with isWithinRoot/resolveToolPath or justify divergence with pins; F2/F3 add permanent repo tests for containment + existence-observation gate; run full tsc+build+10 gates on the composed tree; compose ONE self-contained commit including untracked SpecificationVerificationTool.ts; then reviewed :5002 adoption + fresh multi-prompt UAT. Both CRITICALs stay OPEN.)

## Scope reviewed (read-only; NVIDIA tree untouched)
- NVIDIA main HEAD a10c71ab + 54 dirty files (18 modified + untracked), claim NVIDIA.md 2026-10-03T10:55 Batch-2 COMPLETE.
- Diffs inspected: VisualQATool.ts (+15), BulkFileGeneratorTool.ts (+29), ImageGenerationTool.ts (+10), verification-ledger.ts (+27), registry.ts (+7), plan-tools.ts (+6 catalogue/means), ui-inspection.ts (+78), tool-aliases.test.ts (unrelated refactor).
- Wiring traced: ToolService.ts:839 execute(effectiveInput, executionContext); effectiveContext.workspaceId always set (:337-341 auto-assign); types.ts:15 (input, context?) signature; WorkspaceService getActiveRoot :228-300 (always non-empty); externalRoot :107-123 (always non-empty).
- Gate callers: plan-tools.ts:954 (opt-in true, committed); PhaseExecutorTool.ts:2341-2345 (allowExistenceObs=wasOriginallyProse, committed); plan-verification.ts:22 (2-arg, final gate never opts in, committed).

## Independent evidence (exact bytes, local execution only)
- Probe: tmp/batch011-verify-20261003/probe-batch011.cjs — extracts exact source spans by marker+brace match, asserts byte-inclusion in source, transpiles types with local typescript 5.9.3 (semantics-preserving), runs matrices. No NVIDIA-tree writes.
- Source provenance at probe time:
  ledger sha256=9b62ff0eeb9aec96cd3fac8020e432b294c4adf28845b03c345bcede190a1e93 mtime=2026-10-02T19:41:20Z
  visual sha256=07003a667fb193716c75b7366b917c41ad3740fe2f65cdab4d1b9e6f8759ab93 mtime=2026-10-03T07:43:08Z
  bulk sha256=75a19fd767a2572d2307fe0e81e482570fc2965cafe622edf3dde97967a4798f mtime=2026-10-03T07:27:26Z
  containment sha256=6e906f95bf24c0c1b089d04625d7f09a5eff6a3f41d85d7b66021288becbbd05 mtime=2026-09-24T19:52:15Z
  (NVIDIA tree is live/dirty; bytes may drift after probe. Re-verify hashes before adoption.)
- Result: TOTAL pass=30 fail=0 (L1-L15 gate matrix, B0 bulk-shape, C1-C10 containment + shared-primitive comparison, T1 TS2554 language pin).

## Agreed (with proof)
1. Containment is REAL: traversal/absolute-outside/sibling-prefix all denied (C1-C4), wiring delivers workspaceId (ToolService:839 + :337-341), root resolution fail-closed. Bulk consumes ToolService context per AGENTS.md rule.
2. Image C1/C2 substantially addressed in code: HEAD verification before claim; paid leg guarded (allow_paid + key + providerAllowedByCost); fail-closed tail now reachable (was dead).
3. Ledger +27 is the correct F5-NEW completion: activates ONLY the prose-origin read_file leg (L1), preserves structured rejection (L2), traversal/multi/empty rejection (L3-L5), final-gate non-opt-in (L15), existing checker behavior (L9-L12). project_detect leg still stops (L8) — coherent with honest-stop (substituted only when phase produced nothing observable, plan-tools.ts:957-968).
4. Committed-HEAD arity gap source-proven: 3-param ledger declaration vs 4-arg calls (plan-tools:954, PhaseExecutor:2342-2343), plus T1 pin that extra-arg calls are TS2554 under strict tsc. The 10-gate matrix contains no full typecheck, which is how this hides. (Full-tsc-on-HEAD not executed: NVIDIA tree is read-only for Muse and the worker is active; owner must supply the receipt.)
5. ui-inspection enrichment is additive/low-risk (finding metadata only).

## Findings (must close before adoption)
- F1 (reuse-or-justify): inline startsWith predicate re-types the house primitive isWithinRoot and DIVERGES on win32: case-variant path denied-inline vs allowed-by-primitive (C5a/b/c proven), relative paths cwd-anchored instead of root-anchored (C6 proven; resolveToolPath anchors at root). Fail-closed direction, but availability + drift risk; contradicts ToolService's "one rule, shared with every tool". Replace with isWithinRoot/resolveToolPath (preferred) or pin the divergence as intended with tests.
- F2 (pins): zero repo tests pin containment ('escapes workspace' has 0 hits under api/src tests). C3 open for bulk + visual.
- F3 (pins): zero repo tests pin isSingleOutputObservationPath/4th-arg gate (verification-ledger.test.ts uses 3-arg calls only). Require red/green pins incl. traversal, multi-path, final-gate non-opt-in.
- F4 (composition): registry.ts imports untracked SpecificationVerificationTool.ts — commit must be atomic (registry + new file + dependents) or the tree breaks.
- F5 (design question, not defect): MEANS keyword breadth ('qa','image','art','scaffold' → 3 tools) risks misrouting ('generate image' contains 'image'→visual_qa vs 'generate image'→generate_image depends on matcher precedence, not fully traced this cycle). Owner should state precedence or pin routing tests.
- F6 (residual, image): HEAD-ok proves accessibility, not generated-content; offline/HEAD-fail falls through correctly (paid-if-allowed else fail-closed). Note precision in logs; add repo tests with mocked fetch (no real network in tests).
- F7 (residual, visual): no file type/size validation before base64→vision-router (any bytes sent as image/png; unbounded size → cost risk). Prior CONDITIONAL item still open. Router cost behavior for hasImages under free_only not traced this cycle.

## Not verified (explicitly)
- Owner's "10 gates PASS / 36 tests PASS": NOT independently rerun (would write caches into the read-only NVIDIA tree). No new NVIDIA logs/responses found (latest fallback response 6:09 AM; real-UI driver dirs stale 10/1). UNVERIFIED — neither accepted nor refuted.
- Committed-HEAD full tsc exit code: not executed (see item 4). Source-level arity proof + T1 pin only.
- MEANS matcher precedence, router vision-cost routing, ui-inspection pins: not traced this cycle.

## Audit-lane note (wiring CRITICAL, Muse lane)
- visual_qa present in committed gate set (ledger:738) while the tool was unregistered until dirty BATCH011 = gate-accepts-but-execution-fails wiring gap, now closed by dirty registration. Usable as one concrete matrix row (FULLY_WIRED only after adoption + pins + UAT).
- No new global tool counts claimed this cycle (counts stay UNKNOWN except the 30/30 scoped probe result above).

## CRITICAL-REAL-JOE-UI-001 status from Muse lane
- Official :5002 UAT BLOCKED: no listener on :5002 or :5101 (probed twice this cycle); :5000 UP (uptime ~2500s, version no-commit-file, mtime-correlated with NVIDIA dist build 08:44Z, PID 6696 — provenance LIKELY NVIDIA dev server, NOT proven: no cmdline/cwd access from sandbox).
- No fresh real-UI evidence exists (NVIDIA driver dirs stale 10/1). No new UI run performed: :5000 is API-only (cannot satisfy the "actual Joe UI" clause) and is likely the active owner's dev server (opencode worker observed active; submitting runs risks contention with atomic owner work).
- Verification-contract repair (the run-4b general failure) is materially advanced by the dirty ledger completion reviewed above, but it is UNADOPTED/UNPINNED — no PASS/partial claim.

## Overlap / safety
- Zero source edits; zero writes outside muse-worktree tmp; NVIDIA tree read-only; no worker/process/runtime interference; no network calls except :5000 health + local port probes; no secrets accessed.
- No competing implementation. NVIDIA retains CLI/parser/planner/Batch ownership; Muse stays in independent-review + verification-contract lane per Codex bounded role.
- No PENDING_REVIEW consultation for Muse exists (the one grep hit is a preserved-request section inside an already-REVIEWED file).
