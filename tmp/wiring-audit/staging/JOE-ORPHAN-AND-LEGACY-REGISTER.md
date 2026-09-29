# JOE ORPHAN AND LEGACY REGISTER (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-ORPHAN-AND-LEGACY-REGISTER.md)

SCOPE=Muse-branch checkpoints 1-3. AUDIT-FIRST: no deletions performed or
authorized by this register. Deletion/refactoring requires a later reviewed
decision with an implementation owner + reviewer.

---

PATH=api/src/modules/tools/definitions/BulkFileGeneratorTool.ts
CAPABILITY=bulk_file_generator (file generation)
WHY_SUSPECTED=imported in registry.ts but never constructed; in ROUTER_EXCLUDED
CALLER_SEARCH=live registry: absent. PhaseExecutorTool.ts:254 references it (exclusion list).
DYNAMIC_USAGE_CHECK=registeredNoLiteral=[] — no dynamic/factory path constructs it
CONFIG_USAGE_CHECK=none found
TEST_USAGE=none found
GIT_CONTEXT=present on muse/joe-development @ 8ce2616c
CONFIDENCE=CONFIRMED_ORPHAN
RECOMMENDATION=P1: register-with-hardening vs INTERNAL_ONLY_BY_DESIGN (writes arbitrary paths)

---

PATH=api/src/modules/tools/definitions/SystemTools.ts:1022-1043 (GrepSearchTool)
CAPABILITY=grep_search implementation (code search)
WHY_SUSPECTED=zero references repo-wide; name resolves to search_text via rewrite+alias
CALLER_SEARCH=none (not even imported)
DYNAMIC_USAGE_CHECK=none
CONFIG_USAGE_CHECK=none
TEST_USAGE=none
GIT_CONTEXT=present @ 8ce2616c; bypass looks DELIBERATE (ToolService:523-525 comment: stock Windows lacks grep; search_text is JS)
CONFIDENCE=CONFIRMED_ORPHAN (implementation) + name-shadowed
RECOMMENDATION=P1: wire vs retire vs alias-only (owner decision; bypass rationale must be weighed)

---

PATH=api/src/modules/tools/definitions/* (codebase_navigator literal; see classification.json)
CAPABILITY=codebase_navigator (code navigation)
WHY_SUSPECTED=defined-not-registered; ToolService:562 references the name for session shaping that can never fire for it
CALLER_SEARCH=registry: absent
DYNAMIC_USAGE_CHECK=none found
CONFIG_USAGE_CHECK=open
TEST_USAGE=none found
GIT_CONTEXT=present @ 8ce2616c
CONFIDENCE=CONFIRMED_ORPHAN (registration); overlap analysis open
RECOMMENDATION=P1: behavioral comparison vs search_text/search_files/repo_search, then wire-or-retire

---

PATH=api/src/modules/tools/definitions/* (generate_image literal; see classification.json)
CAPABILITY=generate_image (image generation backend)
WHY_SUSPECTED=defined-not-registered; image_generate rewrite target missing
CALLER_SEARCH=registry: absent
DYNAMIC_USAGE_CHECK=none found
CONFIG_USAGE_CHECK=open
TEST_USAGE=none found
GIT_CONTEXT=present @ 8ce2616c
CONFIDENCE=CONFIRMED_ORPHAN
RECOMMENDATION=P2: fix only under free-first creative contract (paid-provider cost risk if blindly registered)

---

PATH=api/src/modules/tools/definitions/* (visual_qa literal; see classification.json)
CAPABILITY=visual_qa (visual verification)
WHY_SUSPECTED=defined-not-registered; ToolService:74 + :562 reference the name but can never fire for it
CALLER_SEARCH=registry: absent
DYNAMIC_USAGE_CHECK=none found
CONFIG_USAGE_CHECK=open
TEST_USAGE=none found
GIT_CONTEXT=present @ 8ce2616c
CONFIDENCE=CONFIRMED_ORPHAN
RECOMMENDATION=P1: wire-vs-retire review against live visual QA stack (visual-audit/ui-inspection/BrowserSmartTools)

---

PATH=api/src/modules/services/ToolService.ts (TOOL_ALIASES entry web_search->search_api)
CAPABILITY=web_search alias mapping (dead)
WHY_SUSPECTED=hard rewrite web_search->browser_run (ToolService:368) ALWAYS wins first; alias fallback only fires if (!tDef) (:691-695), so the alias is unreachable
CALLER_SEARCH=N/A (mapping, not code)
DYNAMIC_USAGE_CHECK=N/A
CONFIG_USAGE_CHECK=N/A
TEST_USAGE=alias-suite FAST_PATH correction (Codex, in NVIDIA tree) — needs recheck against this finding
GIT_CONTEXT=present @ 8ce2616c
CONFIDENCE=CONFIRMED_DEAD_MAPPING
RECOMMENDATION=P2: pick ONE winner (browser_run vs search_api serve different purposes) and delete the loser + single-winner gate

---

PATH=api/src/modules/services/ToolService.ts:74 (rateLimitBucketKey 'visual_qa' branch)
CAPABILITY=visual_qa rate-limit key (dead)
WHY_SUSPECTED=keys off an unregistered tool name; can never match a real execution
GIT_CONTEXT=present @ 8ce2616c
CONFIDENCE=CONFIRMED_DEAD_MAPPING (harmless)
RECOMMENDATION=P3: remove with the visual_qa wire-or-retire decision

---

PATH=api/src/core/quality/{image-semantic-qa,live-data-qa,shop-qa}.ts + api/src/core/llm/providers/nvidia.ts (UNTRACKED)
CAPABILITY=3 QA drafts + 1 provider draft (Muse prior-cycle work, preserved)
WHY_SUSPECTED=complete modules, zero importers
CALLER_SEARCH=none in api/src (2026-09-29)
DYNAMIC_USAGE_CHECK=OPEN
CONFIG_USAGE_CHECK=OPEN
TEST_USAGE=none
GIT_CONTEXT=untracked @ 8ce2616c; mtime 2026-09-29 15:40 local
CONFIDENCE=PRELIMINARY_ORPHAN (usage checks open)
RECOMMENDATION=P1: integrate-or-classify review; provider draft needs ownership decision first

---

LEGACY_OR_DEAD=none proven. No code is labeled LEGACY_OR_DEAD in this draft:
static absence of callers is NOT enough (dynamic registration/config paths
remain to be surveyed for services/workers). Suspects for later classification:
old/alternate execution paths (deterministic bypasses), duplicate memory
implementations (see matrix DUPLICATE rows — those are live duplicates, not dead).
