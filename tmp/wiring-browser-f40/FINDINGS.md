# Browser-family wiring slice — exact NVIDIA f40 bytes (read-only audit)

EXACT_SOURCE=f40f6100e8083bfefeef54eb7812c3690b068048 (api/src via git archive)
AUDIT_DATE=2026-10-04
AGENT=MUSE (independent audit lane; implementation owner NVIDIA — NO source edits)
SCOPE=L1 definitions → L2 registration → L3 planner/executor references, static only
METHOD=git-archive extraction to tmp/wiring-browser-f40 + refcount.py + targeted reads

## L1 — Implemented (32 tool classes, 8 files)

| File | Classes/names |
|---|---|
| BrowserActionTool.ts | browser_action |
| BrowserRunTool.ts | browser_run |
| BrowserVisionTool.ts | browser_vision |
| BrowserSmartTools.ts | 25 tools incl. browser_launch (class BrowserOpenTool), browser_summarize, browser_page_fix is separate — full list in refcount.csv header |
| PageFixTool.ts | browser_page_fix |
| UserBrowserTool.ts | user_browser |
| VisualQATool.ts | visual_qa |
| WebPageBuilderTool.ts | web_page_builder |

## L2 — Registered (31 of 32)

All instantiated in registry.ts EXCEPT:

- FINDING B1 (IMPLEMENTED_NOT_REGISTERED): `VisualQATool` is IMPORTED
  (registry.ts:14) but NEVER instantiated — `new VisualQATool` occurs NOWHERE
  in f40 api/src. 31/32 browser-family tools registered.

## L3 — Planner / executor references (counts in refcount.csv)

- Deterministic planner (IntentParser/PlanningEngine/plan-tools) references 29
  of 32 names. browser_launch most-cited (18, incl. explicit-URL gates).
- browser_action + browser_vision: registered but ZERO deterministic-planner
  refs; reachable ONLY via tool-picker PRIORITY_TOOL_NAMES (LLM free selection)
  + manual tests. Classification: REGISTERED_NOT_PLANNER_VISIBLE (deterministic).
- visual_qa: expected by 7 production sites but UNREGISTERED:
  verification-ledger.ts:519,738; ToolService.ts:74 (rate-limit bucket),
  ToolService.ts:562 (session injection); PhaseExecutorTool.ts:1735,2032,2036
  (verification-selection regex); tools_encyclopedia.md:25.
  Any plan emitting visual_qa fails at ToolService lookup. PARTIALLY_WIRED.
- ToolService aliases → browser_run (7 names): browser_open, browser_get_state,
  browser_snapshot, web_search, browse, open_browser, web_browse.
- FINDING B2 (dead branch): rateLimitBucketKey checks `name === 'browser_open'`
  (ToolService.ts:74) but is CALLED with effectiveName (:788) AFTER the
  browser_open→browser_run alias (:344-345). The browser_open alternative can
  never fire. Minor legacy residue, no behavior impact.
- FINDING B3 (stale set entries): plan-tools.ts:1265 NEEDS_BUILT_URL contains
  'browser_screenshot' and 'browser_extract' — NO registered tool and NO
  ToolService alias bear these names (only a WS broadcast event type
  'browser_screenshot'). Dormant today (planner never emits them; single
  occurrence is the set literal; consumer at :1491). Latent mismatch.
- Adjacent (non-browser but same alias pattern): tool-picker PRIORITY lists
  'web_search' and 'image_generate', NEITHER registered — priority slots wasted
  (byName.get misses); ToolService aliases catch direct calls only. The LLM
  never SEES web_search/image_generate as provider tools.

## Classification summary (browser family, f40)

- FULLY_WIRED (registered + deterministic-planner-visible): 28
  (all except browser_action, browser_vision, visual_qa, web_page_builder*)
- REGISTERED_NOT_PLANNER_VISIBLE (deterministic): 2 (browser_action, browser_vision; LLM-selectable via tool-picker)
- IMPLEMENTED_NOT_REGISTERED: 1 (visual_qa; executor-expected → repair backlog P1)
- *web_page_builder: registered + planner-visible (builder lane); counted wired.
- DUPLICATE: 0 in this family. UNKNOWN: 0 in this family.

## Ownership / non-overlap

NVIDIA dirty lane touches VisualQATool.ts + IntentParser/PlanningEngine NOW.
Muse records findings ONLY — no implementation, no competing edit.
Recommend repair owner NVIDIA; Muse re-reviews fixed bytes.

## Repro

python tmp/wiring-browser-f40/refcount.py  (paths point at extracted f40 tree)
