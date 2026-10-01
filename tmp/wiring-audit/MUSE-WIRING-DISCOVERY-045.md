# MUSE WIRING DISCOVERY 045 — registry-membership leg CLOSED + live /api/tools exact match

PROBE=tmp/wiring-audit/entry45.cjs (v1->v5; static text scan, zero Joe imports)
+ entry45diff.cjs + entry45ab.cjs
FIXTURES=tmp/wiring-audit/fx-entry45/entry45_{MUSE,MAIN,RUNTIME,GAP}.json
(debug/dbg scripts preserved)
HEAD_MUSE=f85966bb MAIN=e8fd9589 (read-only, dirty preserved, untouched)
RUNTIME=Muse own-API window http://127.0.0.1:5101 (run30 UI test API,
dist rebuilt from f85966bb; ONE unauthenticated GET /api/tools, read-only,
no execution; UI test undisturbed)
ENV=no source edits anywhere, no provider calls by the probe
METHOD=per tree: registry.ts revivedTools+baseTools spans -> class names via
FIVE selection shapes (F44) -> class-chunk `name = 'snake'` map (colon-form
`name:` object literals EXCLUDED; one-level extends-inheritance) -> selected
name set; reconciled against live /api/tools names.

## F44 registry selection uses FIVE shapes (all covered v5)

1. `new X()` plain (base) 2. `createTool(X)` x26 (base, ckpt45 catch: v1
missed ALL of them) 3. `new EliteTools.Member()` namespaced x8 (base,
v1-v3 silently skipped: regex required `(` after the first identifier)
4. bare const-object refs `XxxTool,` (revived:224 TodoWriteTool, base:271
ArchitectTool; ckpt37 B2 shape) 5. `...Spread` arrays (base:262
...MemoryTools -> recall_memory, memorize_codebase; v4 bug: `[]` inside
the `ToolDefinition[]` annotation fooled the bracket matcher, fixed v5).
v1's 1392-name garbage (every `name:` literal x every class) is preserved
in method history as the reason for chunk-scoped `=`-only mapping. `ls`
(2 chars) forced the min-length fix. Unmapped classes v5: ZERO both trees.

## F45 MUSE static 163 = live runtime 163, EXACT, zero gap both directions

Static: 71 revived + 92 base = 163 unique (revived span 71 incl. bare
TodoWriteTool; base 92 incl. 8 EliteTools + ArchitectTool + 2 MemoryTools).
Runtime GET /api/tools: count=163, names received=163.
ONLY_RUNTIME=[] ONLY_STATIC=[]. Startup log "Registered 163 tools (71
revived)" reconciled EXACTLY (revivedTools.filter(Boolean).length=71).
This closes ckpt44's open registry-membership leg for the Muse tree.

## F46 MAIN static 164 = MUSE 163 + specification_verification

MAIN: 71 revived + 93 base = 164 unique, unmapped 0. MAIN-ONLY exactly
{specification_verification}; MUSE-ONLY {}. The +1 is NVIDIA's dirty
EVAL-006 work, properly placed: MAIN registry.ts:37 import +
:295 createTool(SpecificationVerificationTool) in baseTools. Implementation
file untracked; integration disposition (Codex: NEEDS_REWORK) unchanged by
this census — counted as working-tree fact, not committed-main fact.

## F47 ENTRY-B membership leg CLOSED (static + live)

17/20 ENTRY-B names are live-registered on 5101 (static and runtime agree
exactly, both trees modulo MAIN's dirty +1 which is itself selected).
The 3 remaining names (create_file, file_write, write_to_file) are absent
from the registry BY DESIGN: they resolve via TOOL_ALIASES to write_file,
which IS live-registered. End-to-end ENTRY-B chain now evidenced:
emitted (F40) -> declared-or-alias (F41) -> selected (F45/F46) -> live
registered (F45) -> executor alias fallback (ckpt44 rule, source-verified).
Zero statically unreachable REMAINS TRUE at the membership level.

## ENTRY-scoped matrix rows (append to ckpt44 rows)

| CAPABILITY | ENTRY | STATE | EVIDENCE |
|---|---|---|---|
| ENTRY-B 17-name registered core | B | FULLY_WIRED (static+live) | F45+F47, live 5101 names |
| ENTRY-B 3-name alias leg | B | FULLY_WIRED via alias (live target confirmed) | F47, write_file live |
| specification_verification (MAIN dirty) | B | PARTIALLY_WIRED* | F46: emitted+declared+dirty-selected; committed-main UNKNOWN |
| EliteTools 8-name namespaced leg | B | FULLY_WIRED (registered) | F44 shape 3, live names |
| MemoryTools spread leg (2) | B | FULLY_WIRED (registered) | F44 shape 5, live names |
| const-object legs (todo_write, architect_plan) | B | FULLY_WIRED (registered) | F44 shape 4, live names |

*MAIN-dirty verdicts are working-tree facts, not committed-main facts.

Counts: SELECTED_MUSE=163 (71rev+92base) SELECTED_MAIN=164 (71rev+93base)
RUNTIME_MUSE_5101=163 STATIC_RUNTIME_GAP=0/0 UNMAPPED=0/0
ENTRYB_LIVE_REGISTERED=17/20 ENTRYB_ALIAS_ONLY=3/3 (target live)
SELECTION_SHAPES=5 MAIN_ONLY={specification_verification} MUSE_ONLY={}

## Scope honesty / NOT proven
- Membership != executor behavior: live registration does not prove the
firewall/permission/contract legs (separate audit surface).
- Alias leg verified at target-presence level, not by live alias execution.
- MAIN verdicts are dirty-tree facts; MAIN has no live window in this lane.
- Dynamic tool-name construction still not covered (standing static limit).
- No removal/registration action taken or recommended.

NEXT (checkpoint 46): declared-vs-selected reconciliation with ONE method
(DECLARED 174 vs SELECTED 163 -> exact IMPLEMENTED_NOT_REGISTERED list) +
ENTRY-A planner-emitted names.
