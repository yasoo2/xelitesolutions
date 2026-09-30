# MUSE Wiring Discovery 036 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 36)
HEAD=363e90ad + this checkpoint (survey/docs only, no source edits)
DATE=2026-09-30
METHOD=read-only static name extraction (countnames36.ps1): distinct
`name[:=] 'xxx'` regex matches over api/src/modules/tools/definitions/*.ts
in both trees. Filed runs A/B exit 0, JSON SHA256-identical.
No live process; no source edits; NVIDIA tree read-only.
EVIDENCE=tmp/wiring-audit/fx-countnames36/countnames36.ps1 +
countnames36_run{A,B}.json + countnames36_run{A,B}.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=checkpoint 35 (dormant-lead equivalence, filed in 6ac9b8a0/ea5e5173/363e90ad).

## E0 headline: file-count != tool-count, quantified
- Muse HEAD: 192 distinct declared names across 92 files-with-names;
  26 multi-name files.
- Main live tree: 193 distinct declared names across 93 files-with-names;
  26 multi-name files (same list).
- Delta Muse-vs-main is exactly +1 name file on main:
  SpecificationVerificationTool.ts / `specification_verification`
  (NVIDIA dirty, uncommitted) — consistent with checkpoint-33 file
  reconciliation (93 vs 94 files). Committed trees agree.
- 26 multi-name files include BrowserSmartTools, EliteTools, MemoryTool,
  RepoSelfCodingTools, QualityTools, SystemTools, UtilityTools,
  WebDevelopmentTools, ContentTools, KnowledgeTools, etc. (full list in
  run JSON). Any "N tools" claim derived from file counts alone is
  wrong by construction.

## E1 relation to the 164 registered count
Main runtime log reports 164 registered ("Registered 164 tools").
193 static declared names on the same tree => ~29 declared-but-unregistered
name candidates (upper bound, see E2). This is the name-level form of
IMPLEMENTED_NOT_REGISTERED and is consistent in direction with the
orphan/dormant leads already filed (checkpoints 30-35); it does not by
itself promote any name to ORPHANED — each needs registration-path
evidence (registry import + safeNew + dispatch reachability).

## E2 method limits (explicit, not hidden)
- Static regex `name\s*[:=]\s*'[a-z0-9_]+'` ALSO matches non-tool `name`
  fields (phase/task labels, permission names, sub-object names).
  Known suspects in the 26-list: PhaseExecutorTool.ts,
  ProjectPipelineTool.ts, ProjectEditTool.ts, ReactProjectTool.ts,
  ProjectRunTool.ts (large orchestrators with internal named objects).
- Therefore 192/193 is an UPPER BOUND on declared tool names, not a
  tool count. The true declared-tool count needs AST filtering to
  class/object tool declarations (same method as the 167-definition
  scan in JOE-WIRING-AUDIT-SUMMARY, which this checkpoint does not
  re-run; cross-check owed).
- No runtime registry boot was performed (heavy); no /api/tools probe.

## E3 next discovery step
AST-filtered declared-tool enumeration at Muse HEAD (ts-morph or the
summary's AST-scan method), then per-name: registered? (registry.ts),
planner-visible? (catalogue), executor-reachable? (dispatch), to convert
the ~29 upper-bound candidates into classified
IMPLEMENTED_NOT_REGISTERED / alias / false-positive verdicts.

## E4 cross-review note
Codex's 246-name classification (65 compatibility spellings, 16 dormant,
1 broken image alias) and the 164 runtime count are used as evidence,
not truth: this checkpoint independently reproduces the file/name layer
(192/193 static names, A/B deterministic) and AGREES on the delta
attribution (dirty specification_verification). Registry-layer
reconciliation (which of the 192 are the 164) remains open pending E3.
