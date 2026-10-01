# Wiring checkpoint 076 — Muse (2026-10-01)

SOURCE=Read-only cross-tree comparison: Muse HEAD 5dcfa6bc vs NVIDIA main
e8fd9589 (NVIDIA tree untouched; `git rev-parse` + file reads only).
STATUS=PARTIAL (deep audit continues; counts below are single-observation unless noted).

## RECONCILED: the 163-vs-164 lineage delta (074/075 open item CLOSED)
- Muse definitions/: 93 files. NVIDIA-main definitions/: 94 files.
- Delta is EXACTLY one file: SpecificationVerificationTool.ts (present only
  in NVIDIA main).
- Registry diff is EXACTLY 2 lines (import + createTool), both => NVIDIA side:
  Muse registry SHA256 912CE549...; NVIDIA registry SHA256 9C89146B....
- `new XTool(` instantiations: 125 in BOTH trees (delta tool uses
  createTool(), hence equal counts).
- CONCLUSION: 163 (Muse/composed-5f lineage, 074) vs 164 (main lineage, 075)
  is FULLY explained by SpecificationVerificationTool. No hidden registry
  divergence. REPORTED_BY_MUSE, source-verified.

## Discovered-vs-registered direction understood (076 target, partial)
- REGISTERED (164 runtime) > definition FILES (94) because files expand:
  EliteTools namespace spread, MemoryTools, BrowserSmartTools 26-export,
  revivedTools array, createTool wrappers. Direction explained; exact
  per-file expansion map (which file yields which N names) still open.
- DUPLICATE=0 at registry layer BY CONSTRUCTION: tools export throws on
  duplicate name at startup (registry.ts:397-411, read both trees identical
  except the 2-line delta). Runtime 164 registration on 635 bytes (075)
  proves no throw there.

## Carried-over wiring notes
- verificationTask producer-still-string (4 planner schemas) still open (074);
  no owner assigned; Muse started no fix.
- Per-file expansion map + IMPLEMENTED_NOT_REGISTERED sweep still open.
- Load/integrate from commits, never trees (preservation rule stands).

## Next
- 077: IMPLEMENTED_NOT_REGISTERED sweep on main-lineage bytes (definition
  exports vs registry imports), read-only.
- Await: 635 H1/H2/C1/B1 + NVIDIA overlap review + bound gates + post-load UAT.
