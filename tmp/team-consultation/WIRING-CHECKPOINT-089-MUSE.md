# WIRING CHECKPOINT 089 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=8f8b45c3 (exact; verified at probe time)

## Scope: read_file_tree family (read-only, third 086 gap)
089 executes the 088 next step for ONE more gap family: offered
`read_file_tree` vs registered `inspect_directory`. Method: source reads
only (picker offer, ToolService rename :511-518, registry, target contract
+ execute, web refs). No tool executed, no network, no source edited.
Evidence: this file + cited line numbers (Muse HEAD 8f8b45c3).

## Result: coherent rename with one required-field gap
1. OFFER (picker): `read_file_tree` is in PRIORITY_TOOL_NAMES
   (tool-picker.ts:9) but is silently dropped by selectToolDefsForProvider
   (F-086-1 instance: `if (t)` with no else, :44-51). Planner never
   receives this spelling.
2. RENAME (dispatch): ToolService.ts:511-518 renames to `inspect_directory`,
   coerces dir->path (only when path==null and dir!=null), defaults
   depth=3. Sibling list_files/dir family (:519-522) renames to the SAME
   target with depth=1. Per-spelling depth semantics are intentional and
   coherent (tree=deep, list=shallow), not a bug.
3. DISPATCH: `inspect_directory` IS registered (registry.ts:216,
   DirectoryInspectionTool). No dead end.
4. TARGET CONTRACT (UtilityTools.ts:38-53): inputSchema requires `path`
   (required:['path']); depth optional (schema default 1). Output
   {tree:[]} matches execute's return.
5. TARGET IMPLEMENTATION (:55-82): REAL recursive readdir, depth-bounded
   (terminates even on symlink cycles), workspace-aware via
   resolveToolPath(path, workspaceId), honest 'Directory not found'.
   Not a stub.
6. WEB: CommandComposer.tsx:3419 (category icon) + :3476 (transcript
   filter) are display-only; no execution contract. Docs: no matches
   (picker+dispatch+cosmetic only, same shape as 087/088).

## Verdict
- `read_file_tree`: PLANNER_INTENT_UNRESOLVED at offer (F-086-1 drop);
  CONDITIONALLY_WIRED at dispatch (rename + registered target +
  compatible contract WHEN dir-or-path present).
- F-089-1 (new, required-field gap, NOT repaired): the rename does NOT
  guarantee the target's required `path`. Planner input {} or {depth:n}
  (neither dir nor path) arrives with path missing -> required-field
  violation at validation. Contrast 088 github family where the rename
  sets the required `action` unconditionally. Candidate hardening
  (default path='.' when both absent) needs coordinated ownership:
  ToolService is a shared surface — Muse makes no unilateral edit.
- Recommended direction (backlog, coordinated ownership): fix the OFFER
  side (offer registered `inspect_directory`, or a TOOL_ALIASES entry)
  + harden the rename for F-089-1. Keep per-spelling depth semantics.
- Observed for future checkpoints (not 089 scope): grep family
  (:526-528 one-hop to search_text), browse family (:529-531),
  git families (:532-539). One family per checkpoint; no edits.

## Locks carried (not rerun: api/ registry/picker/ToolService/UtilityTools
## + web CommandComposer unchanged since 086; HEAD moved only by docs
## commits + 7cb7d822 web redaction, which does not touch these paths;
## REGISTERED=163 re-observed live in 089-adjacent probe stdout)
- 086: 57 offered / 38 resolved / 19 gaps / 28 aliases 0-broken.
- 087: image chain mapped, STALE_OR_FUTURE, residual hazard open.
- 088: github chain coherent, F-088-1 open.
- 084 P4 + F-086-1 + F-088-1 + F-089-1 await team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed this cycle in probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=3/19 (image 087 + github 088 + read_file_tree 089)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Contract-compare the next probable-rename family (grep/search_code ->
search_text :526-528, or list_files depth-1 already half-mapped here),
or the next Codex-requested bounded scope. No picker/registry/
ToolService edits without coordinated ownership.
