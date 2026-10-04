# Muse wiring-audit slice — checkpoint/resume family on exact f40 (read-only)

AGENT=MUSE
SLICE_ID=CYCLE-CHECKPOINT-WIRING-F40-001
STATUS=EVIDENCE_READY
DATE=2026-10-04
SOURCE_REV=f40f6100e8083bfefeef54eb7812c3690b068048 (NVIDIA main, committed bytes via git show/grep; live dirty lane untouched)
MUSE_HEAD=d70bffc6 (muse/joe-development)
DETAIL=tmp/wiring-checkpoint-f40/FINDINGS.md
SHARED_WRITE=DENIED (standing: absolute path outside workspace; fallback stands for verbatim import)

## Findings (source-evidenced, f40 committed bytes)

- K1 project_state_manager [PARTIALLY_WIRED + DUPLICATE overlap]: registered
  (registry.ts:193) + executable via generic dispatch, but absent from the
  static 40-entry PLANNER_TOOL_CATALOGUE (retrieval-possible, not NEUTRAL);
  ZERO production callers; store is process-local static Maps ("in production,
  use database") so "resumption after interruptions" fails across restarts and
  the bare-projectId key has no user/workspace isolation; duplicates K2/K4
  with no shared code. Repair-or-retire owed (P2).
- K2 engineering checkpoints [FULLY_WIRED]: PhaseExecutor saves per-tool
  (:1655) + per-phase (:2246), loads per-run (:2126) with 24h TTL enforced
  on single + bulk load, atomic tmp+rename writes, fail-closed corrupt
  handling. Minor: 4 imported fns never called (:25) — TTL-at-read covers
  cleanup; P4 hygiene.
- K3 continuation ingress [PARTIALLY_WIRED]: multilingual trigger +
  evidence-gated (interrupted or failed+cancelled) + containment-checked
  resumeProjectRoot threaded to orchestrator (:668) and node path. BUT
  resumeOriginRunId is provenance-only (evidence event); PhaseExecutor loads
  by NEW runId, so origin checkpoints are never reused — "continue" quietly
  re-executes completed work. Thread-or-document owed (P1-P2, NVIDIA-lane
  coordination required).
- K4 page build checkpoints [FULLY_WIRED]: valid-only resume, per-section
  save, clear-on-success, 6h TTL + corrupt-preserved tests. Positive control.

## Counts (this family only)

TOOLS=1 CORE_MODULES=3 FULLY_WIRED_CHAINS=2 PARTIALLY_WIRED=2 ORPHANED=0
DUPLICATE_PAIRS=1 REAL_JOE_PROVEN=0 (source-level; no runtime/UAT attempted)

## Standing re-confirm (this cycle, read-only)

- F1 candidate pins 8/8 zero drift pre- and post-run; arabic suite 10/10
  rerun green (exit 0) incl. F1 case; full F1 APPROVE stands (see
  CODEX-ARABIC-AUTHORITY-F1-20261004-MUSE-STANDING.response.md).
- NVIDIA HEAD f40f6100; 17 tracked dirty preserved; no writes/interruption.
- No competing implementation. No UI PASS claimed. Slice awaits
  second-agent review; K1/K3 need coordinated owner assignment.
