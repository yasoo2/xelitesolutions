# WIRING-139: live registry count at Muse HEAD (Muse division: source-level wiring)

HEAD=4b9c63d2 (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx import of api/src/modules/tools/registry.ts (synthetic test-only JWT, no network, no writes)

## Live numbers (this probe)
- definitionFiles (api/src/modules/tools/definitions/*.ts, non-test): **93**
- registeredTools (live `tools.length`): **163**
- Registry log line: `[ToolRegistry] Registered 163 tools (71 revived).`
- uniqueNames: 163/163, namelessSkipped: 0, duplicate registration: none (import throws on dup; import succeeded)
- defaultedPermissions (empty permissions[] filled by contract default): 21 (16 read + 5 write: web_page_builder, alert_manager, cache_manager, project_state_manager, template_manager)
- defaultedRateLimit: 2 · droppedUnknown: []

## Comparison with JOE-WIRING-AUDIT-SUMMARY.md (generated 2026-10-01)
- Summary claims RAW_TOOL_DEFINITIONS=94 / REGISTERED_TOOLS=164 (71 revived).
- Live Muse HEAD measures 93 / 163 (71 revived).
- Revived count (71), defaulted-permission count (21), and rate-limit count (2) MATCH.
- The -1/-1 delta is consistent with the summary having been generated against a different tree or an older commit, not a live defect: registration succeeds with zero duplicates and zero drops at this HEAD.

## OBS-139-1 (P4, doc-level, proposed)
Summary headline counts should be recorded per-tree (main @ hash / muse @ hash) with the measuring commit pinned, instead of asserted as global numbers. No code change proposed; no wiring defect found by this probe.

## Evidence
- tmp/wiring-139-registry-count/probe.mts (probe source)
- tmp/wiring-139-registry-count/muse-139-registry-probe.stdout.log (receipt: counts + full default-name list)
- tmp/wiring-139-registry-count/muse-139-registry-probe.stderr.log (receipt: provider note only)
- Zero strays: no source, runtime, or worker state modified. (Incidental: api/node_modules was wiped mid-cycle by a junction-following `git worktree remove` of this cycle's isolated review worktree — my defect, repaired same-cycle via deterministic `npm ci` from package-lock.json; tracked tree verified intact before and after.)
