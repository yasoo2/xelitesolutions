# WIRING-145: orchestrator tool-name reference census (AgentLoopService.ts)

HEAD=1b2659e8 (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx
census: registry + resolvePlannedTool + TOOL_ALIASES imported live (same
as 143/144); the orchestrator file is READ as text (never imported, never
executed). Every quoted tool-shaped literal AND every vocabulary-matching
regex token in the file is resolved live through the executor's OWN
resolver. ZERO DISPATCH: no executeTool, no firewall context, no network,
no writes, no registry mutation. Synthetic test-only JWT + JOE_TEST_MODE.

## Live verdict (clean pair run1+run2, 2x EXIT 0, byte-identical SHA256 4E66F39A...)

- Orchestrator file: 1510 lines (python-verified), sha 24e28a43...,
  86904 bytes on disk (1070 CRLF, mixed line endings).
- Registered tools: 163 (continuity with 139-144). Vocabulary
  (registered ∪ aliases ∪ catalogue ∪ static `name:` hits): 203.
- Referenced vocabulary names in the orchestrator: exactly 3 =
  REGISTERED_EXACT 3 + ALIAS_KEY 0 + DANGLING_DECLARED 0 +
  REGISTERED_NONEXACT 0 + DANGLING_UNDECLARED 0.
- The 3 names, all resolving exact live:
  - phase_executor (quoted :1181) — DIRECT executeTool dispatch of the
    canonical phase bridge (verified by source read).
  - joe_engineering_report (quoted :1489) — DIRECT executeTool dispatch
    of the final engineering report (verified by source read).
  - code_reviewer (quoted :109/:377, regex :118, inCatalogue=true) —
    receipt-evidence handling: tool-name comparisons in phase-receipt
    compaction + a quality-gate-failed regex (verified by source read).
- Non-vocabulary literals, fully listed: 16 underscore + 46 plain.
  Underscore: acceptance_gate, continuation_started, current_run,
  direct_response, engineering_report_failed, fidelity_unverifiable,
  honest_blocker, permission_stop, recovery_node, repair_rerun,
  request_fidelity_mismatch, reviewer_findings_lost, run_finished,
  stale_run_dropped, verification_final_gate, verification_summary —
  all run-state/status words, zero legacy tool names. Plain 46: all
  status/schema words (completed, failed, groq, language0, string,
  verified, ...), zero toolish names. Full lists in the logs.

## Dangling verdict: the orchestrator tool surface is exactly 3 names

- TRUE dangling tool refs = 0. No unregistered, alias, or legacy/renamed
  tool name is referenced anywhere in the 1510-line orchestrator.
- The orchestrator dispatches exactly 2 tools directly
  (phase_executor, joe_engineering_report) and reads code_reviewer
  receipts — consistent with the canonical pipeline
  (AgentLoop -> PhaseExecutor -> ToolService). No hidden fourth
  dispatch target exists in this file at this HEAD.

## Audit findings

- OBS-145-1 (P4, record, PROPOSED, no code): pin the orchestrator
  tool-reference baseline for this file at HEAD 1b2659e8 — TRUE set =
  3 (phase_executor :1181 dispatch, joe_engineering_report :1489
  dispatch, code_reviewer :109/:118/:377 receipt handling). Any future
  "orchestrator references unknown tool X" claim against this file
  must reproduce this census before opening a wiring defect. Sibling
  to OBS-144-1 (executor baseline, TRUE set = 2).
- No new wiring defect. Registry <-> resolver <-> orchestrator-refs are
  consistent: every orchestrator tool reference resolves exact live.
- Methodology caveat (disclosed, same as 144): the naive `name: 'xxx'`
  static pattern matched only 16 names (declaredNameCount=16, same set
  as 144) and most are schema/plugin noise — corroborating-only; 140b
  remains the def-site authority. The zero-dangling verdict rests on
  live registry membership + live resolvePlannedTool, not on the
  static pattern.

## Disclosed probe misses (environment/invocation, zero source impact)

- Attempt 0 (not kept): cmd launched with a UNC (\\?\) cwd refused to
  cd, and tsx hit EPERM creating its cache in system Temp. Fixed
  BEFORE any kept run: drive-letter cd + local TMP/TEMP
  (tmp/sbx-tmp-145, REMOVED after the pair).
- Attempt 1 (overwritten by real run1, not kept): PowerShell `>`
  redirection wrote run1.stdout.log as UTF-16LE (BOM fffe), same miss
  class as 143. Corrected: reran run1 via cmd /c redirection (UTF-8,
  BOM-free). Kept run1/run2 are the clean UTF-8 pair (4E66F39A).
- One ad-hoc python print failed on the console codepage (U+2192 in
  the registry default notes); reran with PYTHONIOENCODING=utf-8.
  Display-only; the kept logs are complete and verified
  programmatically.
- stderr pair differs ONLY in importMs (volatile timing, stderr-only).
  Registry default notes identical to 141/142/143/144 (21 defaulted, 2
  rate-set). Stdout carries the same 2 prefix lines before canonical
  JSON ([Config], [ToolRegistry]).

## Evidence

- tmp/wiring-145-orchestrator-refs/probe-orchrefs.mts (census design)
- tmp/wiring-145-orchestrator-refs/run1/run2.stdout.log (4E66F39A..., byte-identical) + stderr logs
- Tracked tree verified CLEAN (0 dirty) before the first kept run and
  after all runs. api/data untouched. No source, runtime, worker, or
  NVIDIA state touched. tsx cache dir REMOVED. Zero strays outside
  tmp/ (only pre-existing issue86/jest-cache + the pre-existing
  `tmp/cache-tsx-143 ` path remain).
