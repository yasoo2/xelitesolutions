# WIRING-156 -- Memory/deep-memory wiring census, live-verified (Muse independent)

MUSE_HEAD=58f65d32 (tracked CLEAN, 0-line api/web delta; all 156 outputs new under tmp/wiring-156-memory-chain/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T19:25Z (this cycle)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), run 2/2 EXIT 0 byte-identical result JSON (sha 1C64BA29...); definition/registry/dispatch/ledger/planner files READ as text. ZERO DISPATCH: executeTool never called, no vectorDb writes, no memorization run, no network, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials). Probe corrections disclosed below; bundle deleted after runs, entry + logs + results preserved.

## TRIGGER
"git/memory matching" is an explicit open scope in shared TEAM-STATE.
Wiring-155 closed the git half; wiring-156 closes the memory half on Muse
HEAD and confirms the NVIDIA tree carries the identical memory chain
(read-only source check).

## LIVE CENSUS (Muse HEAD; bundle-run1.result.json == bundle-run2.result.json byte-identical)
- registered=163; memory-regex hits = 2 (memorize_codebase, recall_memory); both hasExecute=true
- TOOL_ALIASES memory hits: 0 (no memory aliases)
- PLANNER_TOOL_CATALOGUE memory hits: 0/2 (neither memory tool catalogued)
- isVerificationTool unconditional-true: 0/2 (both false; memory tools are never verification tools, by design)
- resolvePlannedTool live, 8 phrases: 2 exact green (recall_memory, memorize_codebase); 4 memory-intent phrases UNKNOWN ('recall what we know about auth logic', 'search memory for the User schema', 'index the codebase into memory', 'memorize the codebase' -- tool null); 2 MISROUTES: 'what did we learn about the payment module'->payments_create_checkout_session via meaning, 'remember how login works'->auth_builder via meaning -- see OBS-156-2
- gateShapes (pure ledger calls): recall-valid=false, recall-empty=false, memorize-dir=false, memorize-empty=false (consistent with unconditional-false; no memory verification contract exists)
- Registry log live: "Registered 163 tools (71 revived)"; 21 permission defaults corroborated again (no memory tool among them -- both declare permissions)
- registryMemoryToolsRefs: 2 (import + spread of MemoryTools in registry.ts)

## SOURCE READS (both lines; MemoryTool.ts + ToolService.ts byte-identical)
- MemoryTool.ts (5.3KB, sha 823037C8...): 2 tools, both with execute. Header comment claims "The bodies now live here" after a move OUT of ToolService -- STALE, see shadow finding. memorize globs repo files (default 8 exts, skips node_modules/dist/.git), vectorDb.clear() then addDocument per file with per-file try/catch + 50KB truncation; missing-dir guard via getActiveRoot(context?.workspaceId). recall requires non-empty query (honest sentence, no TypeError).
- plan-tools.ts memory surface: ZERO refs (planMemRefs empty) -- planner layer has no memory vocabulary at all. toolCatalog.ts:56 holds an Arabic memory lexicon (ذاكره/تذكر/احفظ/استرجع -> memory/recall/remember/knowledge/store) but no route to the memory tools is proven: all 4 intent resolutions are unknown.
- PlanningEngine.ts:3097/3102 memory refs are a comment-only live-round anecdote (recall-then-chat failure story), not wiring.
- ToolService.ts SHADOW (both lines, :570-608): executeTool intercepts raw name 'recall_memory' (:571) and 'memorize_codebase' (:583) with early-return DUPLICATE bodies -- the registry execute() copies are SHADOWED on the canonical path (live only for direct-registry callers). The two copies DIVERGE, and the canonical path runs the WEAKER copy:
  (a) ToolService recall has NO empty-query guard (passes input.query raw to vectorDb.search);
  (b) ToolService memorize has NO existsSync/root guard and NO per-file try/catch: vectorDb.clear() runs FIRST (:591), then a single unreadable/stat-failing file throws -> whole run FAILS with memory already WIPED (registry copy survives per-file and keeps the rest);
  (c) ToolService memorize logs `[Memory] Indexing N files` to stdout (registry copy is silent).
- NVIDIA compare (read-only): MemoryTool.ts byte-identical (823037C8); ToolService.ts byte-identical (F8608F51); svc memory-ref lines 7=7. The shadow exists on BOTH lines.

## CLASSIFICATION (Muse independent position)
- recall_memory: PARTIALLY_WIRED (registered + executable BUT planner-unknown for intent phrases + shadowed by a weaker ToolService copy on the canonical path)
- memorize_codebase: PARTIALLY_WIRED (same; plus clear-then-index destructive shape in BOTH copies -- a failed run can empty the index)
- MemoryTool.ts registry bodies: SHADOWED_DUPLICATE (contradict their own header comment; reachable only off the canonical path)
- ToolService :570-608 memory handlers: CANONICAL_BUT_WEAKER (the copy Joe actually runs)
- Planner memory vocabulary: MISSING (0 catalogue, 0 MEANS route proven, 4/4 unknown + 2 misroutes)

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-156-1 (P2): memory dual-implementation with shadowing + divergence, live-proven on BOTH lines. Canonical path (ToolService) runs the weaker copy: no empty-query guard, and clear-before-index WITHOUT per-file survival -- one bad file wipes then fails. Recommend the ToolService/planner owner (NVIDIA dirty scope; propose, do not patch): keep ONE implementation (the registry copy is the hardened one), delete or delegate the other, and add a canonical-path-vs-registry agreement test incl. an unreadable-file survival case and an empty-query case. Narrow, no behavior risk to other names.
- OBS-156-2 (P3): planner memory vocabulary gap + misroutes, live-proven. 4/4 natural memory phrases unknown; payment/login memory questions route to payments/auth BUILDERS (wrong capability family). Recommend the planner owner add memory MEANS keys + catalogue entries for recall_memory (and a guarded memorize entry or explicit exclusion), plus negative misroute pins. Note the Arabic lexicon at toolCatalog.ts:56 exists but routes nowhere proven -- verify or connect, do not assume.
- OBS-156-3 (P4): MemoryTool.ts header comment is stale ("bodies now live here" while ToolService still intercepts). Correct the comment as part of the OBS-156-1 disposition, not alone.
- BATCH note: memory chain now has live Level-2/3 evidence (2 registered, 0 catalogued, 0 unconditional + 4 gate-shape pins, 8/8 resolutions incl. 4 unknown + 2 misroutes, 2/2 hasExecute, shadow proven by source read on both lines); Level-6 remains UNVERIFIED -- consistent with OBS-150-2.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git diff --numstat empty) -> prior greens still apply to identical source: smoke-verification-rewrite 5/5 + prose 14/14 (see feas-bu lineage). No jest rerun this cycle (bundle pattern used; no wedge hidden).
- Zero contract deaths in all preserved runs (run4b/run22 lineage); Gap-A/B negative integration tests remain NVIDIA/Codex-owned follow-ups, still unimplemented (NVIDIA owns ledger/planner scope, actively dirty, worker live).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + live resolution + gate-shape pins + source reads); no memorization executed, no vectorDb touched, no UAT (provider-blocked, see feas-bu).
- Probe corrections disclosed: (1) esbuild.ps1 shim fails in this sandbox (D: lstat EISDIR) -- invoked node on esbuild/bin/esbuild directly; (2) bare bundle fails on .node/chromium-bidi -- rebuilt with --packages=external (same flag as the api build script); (3) bundle runtime needs NODE_PATH=api/node_modules + synthetic JWT_SECRET + SRC_DIR (temp-run __dirname) -- all documented, no secrets.
- run1/run2 .log files differ only in volatile importMs; RESULT JSON pair is byte-identical (1C64BA29...).
- NVIDIA tree touched READ-ONLY (hashes + greps, 0 writes). HEAD e8fd9589, 47 changed paths, worker parent + fresh opencode child live; untouched.
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
