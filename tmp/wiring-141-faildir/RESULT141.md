# WIRING-141: fail direction of unregistered-but-implemented tool names (closes OBS-140-3)

HEAD=e2482a25 (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx
dispatch through the real executeTool (ToolService) inside the firewall's own
authorized orchestrator context (runInContext, as AgentOrchestrator.coordinate
does). Synthetic test-only JWT + JOE_TEST_MODE; no network, no writes, no
registry mutation. Fail-closed probe: registered names are never dispatched
(except the side-effect-free echo positive control).

## Live verdict (clean pair run2+run3, 2x EXIT 0, byte-identical SHA256 774B163B...)

| Name | Layer A registered? | Alias? | Dispatched? | Result |
|---|---|---|---|---|
| bulk_file_generator | NO | none | YES | ok:false unknown_tool (suggests repo_read_file, ai_write_file, progressive_generator, file_edit, write_file) |
| codebase_navigator | NO | none | YES | ok:false unknown_tool (suggests memorize_codebase, analyze_codebase, codebase_outline) |
| generate_image | NO | none | YES | ok:false unknown_tool (suggests image_studio, ci_generate_pipeline) |
| visual_qa | NO | none | YES | ok:false unknown_tool (suggests visual_compare) |
| no_such_tool_141 (control) | NO | none | YES | ok:false unknown_tool (no suggestions) |
| echo (control) | YES | none | YES | ok:true output echoed (dispatch path live) |

- Registry line both runs: `[ToolRegistry] Registered 163 tools (71 revived).`
- Fail direction for ALL 4 unregistered names: LOUD fail-closed unknown_tool
  with nearest-name suggestions. NOT a silent skip, NOT a crash, NOT an alias
  rescue. Indistinguishable at the dispatch layer from a never-implemented name.
- Positive control echo ok:true proves the dispatch path past the firewall and
  lookup layers was live; the unknown_tool verdicts are real, not probe-env
  artifacts. Bare dispatch without runInContext would throw at the firewall
  (AgentExecutionFirewall.ts:88-98) — recorded so a future probe does not
  misread a firewall throw as a lookup verdict.

## Executor dangling references (re-confirmed at this HEAD, same lines as 140)

- bulk_file_generator: PhaseExecutorTool.ts:112 (write-tools list), :254.
- visual_qa: PhaseExecutorTool.ts:1737/:2047/:2051 (verification regexes).
- Current blast radius: ZERO live effect — any plan referencing either name
  dies loudly at dispatch with unknown_tool before any side effect. The
  write-list membership (:112/:254) is latent, not active.
- Latent risk (no action this cycle, audit-first): if bulk_file_generator were
  ever registered as-is, the write-list would immediately grant it write-phase
  treatment despite its absolute-path/no-containment defects (RESULT140). The
  140 dispositions STAND: do NOT register generate_image or bulk_file_generator
  as-is; visual_qa and codebase_navigator remain UNKNOWN_REQUIRES_INVESTIGATION.

## Audit findings

- OBS-140-3 (P2, wiring): RESOLVED by this probe — fail direction proven live.
- OBS-141-1 (P3, doc, extends OBS-140-1): shared-matrix RECONCILIATION row
  IMPLEMENTED_NOT_REGISTERED=0 contradicts live dispatch proof on this tree
  (4 names, unknown_tool at executeTool). Pin reconciliation rows per-tree and
  per-commit; do not assert global zeros.
- OBS-141-2 (P2, wiring, PROPOSED repair-backlog item, no code this cycle):
  executor holds dispatch references to 2 unregistered names. Decide per name:
  register-with-guards (containment + opt-in + tests + review) or remove the
  references. Owner unassigned; overlaps NVIDIA planning/executor scope, so no
  Muse implementation without an ownership decision.
- DUPLICATE_REGISTRATION still 0 (140b holds; no re-probe needed).
- Set-hash continuity: 163 tools / 71 revived identical to 139+140.

## Disclosed probe misses (environment/design, zero source impact)

- run0 (not kept): bare executeTool call design would throw at the firewall for
  every name. Corrected BEFORE any kept run: dispatch inside the firewall's own
  public runInContext, mirroring AgentOrchestrator.coordinate().
- run1 (kept, SUPERSEDED for equality): missing JWT_SECRET (config.ts refuses
  to import) then, after the synthetic secret, an echo log timestamp made
  stdout non-deterministic. Corrected: synthetic test-only JWT at invocation
  (no production credentials) + [TS] normalization. run1 verdicts match the
  clean pair; only the timestamp byte differs.
- stderr pair differs ONLY in importMs (74 vs 95, volatile timing, stderr-only).
  Registry default notes identical (21 defaulted incl. echo->read, 2 rate-set).
  8x `[WS] broadcast ... liveWssRef is null` both runs (no server attached).
- PowerShell `>` writes UTF-16: all receipts via cmd /c with `cd /d` first
  (bare cmd inherits an unusable extended-path cwd in this sandbox).
- tsx IPC cache redirected to tmp/cache-tsx-141, REMOVED after runs.

## Evidence

- tmp/wiring-141-faildir/probe-faildir.mts (fail-closed design + [TS] normalization)
- tmp/wiring-141-faildir/run2/run3.stdout.log (774B163B..., byte-identical) + stderr logs
- tmp/wiring-141-faildir/run1.stdout/stderr.log (superseded volatile miss, kept)
- Tracked tree verified CLEAN (0 dirty) before the first kept run and after all
  runs. api/data untouched (latest writes Oct 1). No source, runtime, worker,
  or NVIDIA state touched. Zero strays outside tmp/.
