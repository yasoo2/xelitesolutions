# JOE ORPHAN AND LEGACY REGISTER (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-ORPHAN-AND-LEGACY-REGISTER.md)

SCOPE=Muse-branch checkpoints 1-3 + 29 (services survey). AUDIT-FIRST: no
deletions performed or authorized by this register. Deletion/refactoring
requires a later reviewed decision with an implementation owner + reviewer.

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

---

PATH=api/src/modules/services/CortexState.ts (+ tracked api/cortex.json)
CAPABILITY=CortexState task+financial ledger (service)
WHY_SUSPECTED=zero references repo-wide outside its own file; committed stale
store (api/cortex.json: status 'running' ledger from the God-Mode era)
CALLER_SEARCH=symbol 'CortexState' occurs ONLY in its own file across Muse
api/src + web/src; main api/src likewise zero outside its own file. Module-path
scan (services/CortexState, ./CortexState): 0 importers both trees.
DYNAMIC_USAGE_CHECK=symbol search covers string/dynamic-import spellings in
api/src + web/src — none found. scripts/docs not surveyed (cannot create a
runtime import).
CONFIG_USAGE_CHECK=none found (no config key references the module)
TEST_USAGE=none found
GIT_CONTEXT=introduced 7073dd35 'System Awakening (Persistence, God Mode,
Financials)'; store committed ca13493d 'God Mode'; services/ file lists
identical main-vs-Muse (inherited, not Muse-introduced) @ b004bdc8
CONFIDENCE=CONFIRMED_ORPHAN (service) with legacy-era provenance
RECOMMENDATION=P2: wire-or-retire decision (P2-049); latent process.cwd() write
(api/cortex.json) must be contained or removed with the decision — do NOT
leave a cwd-anchored financial ledger one import away from activation

---

PATH=api/src/modules/services/AlertService.ts
CAPABILITY=AlertService deploy notifier (Telegram/webhook/email)
WHY_SUSPECTED=single import, zero invocations: imported at
DeployManager.ts:9 (both Muse and main trees) but never called; symbol
'alertService' occurs only at the export (AlertService.ts:92) + that import
CALLER_SEARCH=module-path scan: 1 importer (DeployManager), import-only
DYNAMIC_USAGE_CHECK=symbol search across Muse api/src — no other mentions
CONFIG_USAGE_CHECK=reads SystemConfig notification_settings + TELEGRAM_BOT_TOKEN
/TELEGRAM_CHAT_ID/ALERT_WEBHOOK_URL at call time (dormant: no caller)
TEST_USAGE=none found
GIT_CONTEXT=present both trees @ b004bdc8 (inherited)
CONFIDENCE=CONFIRMED_PARTIALLY_WIRED (import-only; no invocation path)
RECOMMENDATION=P2: wire-or-remove decision (P2-050); if wired, secret-surface
review first (Telegram token + arbitrary webhook POST); if removed, drop the
dead import + classify the notifier capability gap

---

PATH=web/src/components/TaskTracker.tsx
CAPABILITY=run progress-ring tracker UI (session-keyed task display)
WHY_SUSPECTED=default-exported component with zero importers repo-wide
(api + web/src + extension + services scan): only its own file plus
socket.ts taskTrackerData state fields and one backward-compat comment
(socket.ts:517). Sole subscriber of SocketService.subscribeTaskTracker
(socket.ts:850); channel itself is live (server todo_update from
ws.ts:525 + TodoWriteTool.ts:53 feeds the mapping at socket.ts:517-524),
so live data flows to a subscription no rendered component consumes.
CALLER_SEARCH=import-index (static + dynamic import) + repo-wide symbol
scan: 0 component importers; main.tsx-style lazy routing ruled in for
the method (SystemManagement control resolves)
DYNAMIC_USAGE_CHECK=no string-route/lazy reference found
CONFIG_USAGE_CHECK=N/A (UI component)
TEST_USAGE=none found
GIT_CONTEXT=present on main too (inherited)
CONFIDENCE=CONFIRMED_ORPHANED_UI (component unrendered; channel live)
RECOMMENDATION=P2: retire-or-render decision (P2-052); if retired, drop
the component + the consumerless compat mapping; if rendered, mount it
in the run view with session key + visual test

---

PATH=api/src/api/routes/queue.ts
CAPABILITY=in-memory per-session task queue REST API (global.joeQueues)
WHY_SUSPECTED=mounted at /queue (app.ts:18,281) and authenticated, but
zero in-repo callers: useTaskQueue hook named in the header comment does
not exist in web/src; no /queue/* fetch in web/src. Live queue path is
/sessions/:id/queue (sessions.ts:28-29 -> sessionController.ts:577,589),
used by CommandComposer (tsx:919,948). Two overlapping per-session queue
implementations; only the sessions one is called.
CALLER_SEARCH=repo-wide /queue fetch scan: only the route file itself +
app.ts mount + sessions-route (different path)
DYNAMIC_USAGE_CHECK=no dynamic fetch-URL construction found for /queue/*
CONFIG_USAGE_CHECK=N/A
TEST_USAGE=none found
GIT_CONTEXT=present + mounted identically on main (inherited)
CONFIDENCE=CONFIRMED_DUPLICATE_CALLERLESS (mounted route, no caller)
RECOMMENDATION=P2: retire-or-wire decision (P2-051); if retired, unmount
+ remove (external callers must be ruled out first); if wired, point a
real caller at it or merge into the sessions queue; either way fix the
stale header comment

---

LEGACY_OR_DEAD=none proven. No code is labeled LEGACY_OR_DEAD in this draft:
static absence of callers is NOT enough (dynamic registration/config paths:
workers surveyed in checkpoint 30 incl. dynamic-import indexing; remaining:
NVIDIA-owned planning/memory). CortexState has legacy-era provenance but
is classified ORPHANED (a runtime path could theoretically exist outside the
surveyed roots). Suspects for later classification: old/alternate execution
paths (deterministic bypasses), duplicate memory implementations (see matrix
DUPLICATE rows — those are live duplicates, not dead).
