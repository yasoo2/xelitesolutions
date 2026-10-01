# Wiring audit checkpoint 063 — generate_image orphan + grep-alias validation (2026-10-01, Muse)

MUSE_HEAD=71033154. MAIN=e8fd9589 (+14 dirty, read-only text reads only, untouched).
Mode: static source inspection on the Muse tree. No execution, no servers,
no network, no provider calls. Cross-review of a Codex-flagged item.

## Proven this cycle
P1. generate_image IMPORT-WITHOUT-REGISTRATION CONFIRMED (reproduces the
    Codex flag on current Muse HEAD).
    - ImageGenerationTool imported at registry.ts:15 and NEVER referenced
      again in that file; absent from both baseTools (registry.ts:227-340)
      and revivedTools (registry.ts:138-225). Zero registry path.
    - Implementation is REAL (api/src/modules/tools/definitions/
      ImageGenerationTool.ts): name 'generate_image', real input/output
      schemas, execute() calls dall-e-3 when OPENAI_API_KEY is set,
      else builds a Pollinations.ai URL. Not a stub.
    - Canonical-name alias exists in the OTHER direction:
      ToolService.ts:551-553 maps image_generate -> generate_image.
    - Classification per audit taxonomy: ORPHANED (implementation exists,
      no legitimate runtime registry path found). Static only — no LEVEL
      claim beyond source existence + alias wiring.
P2. PAID-POLICY RISK CONFIRMED (contained, not active). execute() spends
    paid OpenAI dall-e-3 budget whenever OPENAI_API_KEY is set, with no
    cost-policy/free-only gate in the tool. Today the tool is unreachable
    via the registry, which accidentally contains the risk. Any future
    registration MUST add the gate first. Discovery only; no repair.
P3. grep_search INTENTIONAL-ALIAS VALIDATED (Codex correction holds).
    ToolService.ts:526-528 redirects grep_search (and search_code,
    find_in_files, grep) to search_text. Consistent with the revivedTools
    comment (registry.ts:218). Must NOT be registered (shadow-lock);
    do NOT classify as orphan. No duplicate registration proposed.
P4. NEW DOC MISMATCH (doc-only, no behavior impact). registry.ts:329-331
    comment says grep_search redirects to search_files, but the code
    redirects to search_text. Two distinct tools exist (search_files at
    :217 via FileSearchTool, search_text at :219 via SearchTextTool), so
    the comment names the wrong target. Backlog: one-line comment fix.
    Not fixed this cycle (audit-first; this commit stays evidence-only).

## Finding
F-063-1 P1_GENERATE_IMAGE_ORPHAN: implemented + aliased but unregistered.
    Repair backlog (team decision required): either register WITH a
    cost-policy gate + planner-visibility review, or classify
    INTERNAL_ONLY_BY_DESIGN / LEGACY with the import removed. Never
    silently register: dall-e-3 spend + Pollinations external call.
F-063-2 P3_REGISTRY_COMMENT_MISMATCH: grep_search target misnamed in
    comment. Trivial doc fix, needs no test beyond reading.

## Counts (proven vs unknown — no invention)
ORPHANED=UNKNOWN globally (+1 confirmed instance: generate_image)
FULLY_WIRED=UNKNOWN PARTIALLY_WIRED=UNKNOWN DUPLICATE=UNKNOWN
EXECUTABLE_TOOLS=UNKNOWN (still 1 runtime-proven: echo, from 062)
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0.
TARGET_MAIN=UNKNOWN (not re-probed; owner dirty syntax break per 062 P5;
text reads only, no import/execution of main).

## Next discovery step
Planner-exposure probe for the bounded sample (carried from 062):
registry->planner visibility + selection reachability, read-only.
Owner: Muse lane. No repair proposed.
