# WIRING-143: live resolve-surface + planner-catalogue coverage census

HEAD=a90dad2b (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx
resolve-only probe through the executor's OWN resolver
(resolvePlannedTool, plan-tools.ts:228 — the exact function PhaseExecutor
calls at task dispatch :1394 and verification dispatch :2306). ZERO
DISPATCH: no executeTool, no sanitisePlanPhases, no network, no
filesystem writes, no registry mutation. Synthetic test-only JWT +
JOE_TEST_MODE (config import requires it, same as 141/142).

## Live verdict (clean pair run1+run2, 2x EXIT 0, byte-identical SHA256 59455906...)

- Registered tools: 163, resolve-exact: 163, non-exact: 0. Every
  registered name snaps to itself with how=exact through the same code
  path a plan's tool string travels at dispatch.
- Registry line both runs: `[ToolRegistry] Registered 163 tools (71 revived).`
  Set-hash continuity with 139/140/141/142 holds (163/71).
- Planner catalogue: 40 entries, 40 unique, 0 dupes, 0 unregistered,
  0 not-exact, 0 empty-purpose. The full planner vocabulary is live-proven
  registered AND dispatch-resolvable on this exact tree.
- Registered-not-in-catalogue: 123/163 (by design — the catalogue header
  says it is deliberately a SHORT prompt list). Pinned live as the
  standing SELECTABLE-layer baseline (see OBS-143-1).
- Alias resolution through the executor's own resolver: 28/28 resolve to
  their registered targets (0 bad). Cross-confirms the 142 alias-integrity
  census through the dispatch path, not just the metadata table.

## Audit findings

- OBS-143-1 (P4, record, PROPOSED, no code): the 123 registered-but-
  catalogue-absent names (registeredNotInCatalogue in the run logs) are
  planner-invisible BY DESIGN, not by defect. Any future "tool X
  unreachable by planner" claim must first check membership in this pinned
  list before opening a wiring defect. No re-probe needed until the
  registry or catalogue changes.
- OBS-143-2 (P4, doc, PROPOSED, no code): PLANNER_TOOL_CATALOGUE header
  comment still says "not all 151 registered tools" (plan-tools.ts:73);
  live count is 163. One-word comment refresh at the next owned touch of
  that file. Not edited this cycle: plan-tools.ts sits inside NVIDIA's
  active dirty scope on main; no overlapping edit without an ownership
  decision.
- No new wiring defect: registry <-> resolver <-> catalogue <-> aliases
  are fully consistent live. OBS-140-1 (P3) + OBS-140-2 (P4) + OBS-141-1
  (P3 doc) + OBS-141-2 (P2 wiring) + OBS-142-1 (P3 hygiene) + OBS-142-2
  (P4 record) remain PROPOSED and untouched by this probe (resolve-only,
  no executor-ref or dispatch-behavior read).

## Disclosed probe misses (environment/invocation, zero source impact)

- Attempt 0 (overwritten by real run1, not kept): PowerShell `>` redirection
  wrote run1.stdout.log as UTF-16LE (BOM fffe), breaking continuity with the
  UTF-8 139-142 logs. Corrected: reran run1 via cmd /c redirection (UTF-8,
  BOM-free). Kept run1/run2 are the clean UTF-8 pair; cache dir REMOVED.
- PowerShell echoed the probe's stderr as NativeCommandError noise and one
  inline python print failed on the console codepage (U+2192 in the
  registry default notes). Invocation-only display issues; the kept logs
  are complete and verified programmatically.
- Stdout carries the same 2 prefix lines as 141/142 ([Config],
  [ToolRegistry]) before the canonical JSON; pair equality covers the
  full bytes.
- stderr pair differs ONLY in importMs (7338 vs 7370, volatile timing).
  Registry default notes identical to 141/142 (21 defaulted, 2 rate-set).

## Evidence

- tmp/wiring-143-resolve-census/probe-resolve.mts (resolve-only design)
- tmp/wiring-143-resolve-census/run1/run2.stdout.log (59455906..., byte-identical) + stderr logs
- Tracked tree verified CLEAN (0 dirty) before the first kept run and after
  all runs. api/data untouched (latest writes Oct 1). No source, runtime,
  worker, or NVIDIA state touched. Zero strays outside tmp/ (pre-existing
  issue86/jest-cache untracked paths only; tsx cache dir removed).
