# codebase_navigator orphan decision brief (Muse cycle 238, 2026-10-04)

MUSE_HEAD=aef4a4692a14199c9809fbe34f9718f1104371bb (tracked clean at probe time)
NVIDIA_HEAD=a10c71ab + 19 tracked dirty (read-only; 6/6 hashes match C236/C237, zero drift)
PROBE=tmp/c238-navigator/PROBE-c238-navigator.ts + fixture/ + work/run.json
LIVE_RUN=EXIT 0, OPENAI_API_KEY emptied, cwd disposable work/ dir, LanceDB under work/data/

## 1. What the tool is

`api/src/modules/tools/definitions/CodebaseNavigatorTool.ts` (5555 bytes, object-style
definition, name `codebase_navigator`, v2.0.0). Two actions over a VectorMemory index:

- `index { targetDir, pattern? }` — glob files, chunk >5KB, embed + store each chunk.
- `search { query, limit? }` — vector search, returns { filePath, score, preview }.

Deps resolve on Muse HEAD: glob ^13.0.3 (installed 13.0.6), openai ^6.21.0
(installed), @lancedb/lancedb ^0.26.2 (installed). Embedding mode is free-first
by construction: OpenAI text-embedding-3-small only when OPENAI_API_KEY is set,
otherwise local 256-dim hash embeddings (VectorMemory.ts:29-35,80-103).

## 2. Current wiring (exact census, both trees)

| Signal | Muse HEAD | NVIDIA dirty a10c71ab |
|---|---|---|
| Defined (own file) | YES | YES (same file, unmodified scope) |
| Registry import (registry.ts:16) | YES | YES |
| Registry instantiation | NO (import-only) | NO (import-only) |
| ToolService risk regex (:198, 'low') | YES | YES |
| ToolService session-inject (:562) | YES | YES |
| tools_encyclopedia.md doc line | YES (:20) | n/a (not checked; doc-only) |
| Tests referencing it | 0 | 0 (per prior audit; unchanged bytes) |
| PLANNER_TOOL_CATALOGUE / MEANS / TOOL_ALIASES | 0 / 0 / 0 | 0 / 0 / 0 |
| Planner-visible path if emitted | unknown_tool dead-end (ToolService.ts:714) | same |

Classification: ORPHANED (LEVEL-1 source-existence) on Muse HEAD. The two
ToolService references are conditional on dispatch and unreachable while the
tool is unregistered; they are forward-compatible wiring, not an execution path.
On NVIDIA dirty tree it is the SOLE remaining import-only orphan (BATCH011
revived visual_qa/generate_image/bulk_file_generator at registry.ts:288-290).

## 3. LEVEL-4 runtime proof (new this cycle)

Direct execute() on Muse HEAD, keyless (local embeddings), disposable cwd:

- index 2-file fixture: ok=true, "Indexed 2 files.", 20954ms (LanceDB native load).
- search "zephyr invoice totals": ok=true, correct ranking first
  (invoice.ts distance 1.652 < notes.md 2.0; lower=L2-better).
- unknown action 'delete': throws (input contract enforced).
- search consumer contract MATCHES producer: VectorMemory.search returns
  chroma-shaped { ids:[[]], documents:[[]], distances:[[]] } (VectorMemory.ts:134-167),
  exactly what the tool reads. No contract mismatch on this boundary.
- No network calls observed on the keyless path (local embeddings only).

Result: the implementation itself is FUNCTIONAL. Wiring, not code, is the blocker.

## 4. Shared-register correction (3-vs-4 reconciliation)

JOE-ORPHAN-AND-LEGACY-REGISTER.md ORPHAN-002 contains two row errors:

1. `codebase_navigator | CodebaseNavigatorTool.ts | revivedTools` — registry
   status is WRONG. It is import-only on e8 (verified via
   `git show e8fd9589:registry.ts`), on Muse HEAD, and on NVIDIA dirty.
   Correct bucket: IMPLEMENTED_NOT_REGISTERED, not "revivedTools planner-invisible".
2. `codebase_outline | CodebaseNavigatorTool.ts | revivedTools` — registry
   status is correct (registry.ts:143 safeNew) but SOURCE FILE is wrong:
   it is a separate class in CodebaseOutlineTool.ts, unrelated to the navigator file.

Corrected counts: IMPLEMENTED_NOT_REGISTERED = 4 (not 3) on e8/Muse HEAD
(visual_qa, generate_image, bulk_file_generator, codebase_navigator);
= 1 (codebase_navigator only) on NVIDIA dirty tree. The audit's count of 3 came
from mis-bucketing navigator as registered, not from a source difference.

## 5. Revival requirements (if the team chooses revive)

R1. Instantiate in registry (revivedTools safeNew + label) — 1 line + import exists.
R2. WORKSPACE CONTAINMENT (blocking, same defect class as bulk/visual HOLDs):
    targetDir accepts any absolute path with no workspace-root check; must be
    contained to the trusted session workspace before any planner/catalogue exposure.
R3. PERMISSION/CONTRACT review (blocking): permissions ['read','internet'] over-claims
    on the local path (network only when a key is configured); sideEffects ['read']
    UNDER-claims index (it WRITES data/lance_memory). Both must be corrected/pinned.
R4. POLICY: OpenAI-embedding path must stay free-first/fail-closed (no silent paid
    fallback); keyless local path is the default and is proven above.
R5. MULTI-USER: module-level singleton + cwd-relative store (VectorMemory.ts:7) is
    cwd-fragile and cross-tenant unsafe; needs per-workspace store or explicit
    single-user scoping before production exposure.
R6. OVERLAP decision: recall_memory / memorize_codebase (ToolService built-ins),
    search_text (registered, grep_search alias target), analyze_codebase,
    project_detect already cover adjacent ground. Revival must state which
    capability navigator uniquely owns (cross-file semantic ranking) or deduplicate.
R7. Permanent negative pins (uncontained targetDir, keyless default, empty-index
    search, unknown action) + type/build/exact-commit receipts; catalogue/MEANS
    only after R2-R4.

## 6. Close rationale (if the team chooses close)

- Adjacent coverage exists (R6); local hash embeddings are weak semantics and the
  tool's unique value (ranked semantic search) is unproven on real repos.
- Keeping it import-only while documented in the encyclopedia is the worst option:
  either revive with R1-R7 or remove the import + doc line + ToolService refs and
  record LEGACY_OR_DEAD with rationale.

## 7. Muse position

- No Muse implementation (audit-first; NVIDIA owns registry/batch scopes; no overlap).
- Do NOT expose to planner/catalogue until R2-R5 are satisfied (consistent with
  standing BATCH011 HOLDs). Import-only + encyclopedia-doc state must not persist:
  team owner decision (revive-with-pins vs formal close) still owed.
- CRITICAL-REAL-JOE-UI-001 and CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT stay OPEN.
  :5002 unreachable (official UI down, unchanged); :5000 API-only OK, not acceptance.
