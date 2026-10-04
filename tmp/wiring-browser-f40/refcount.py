import os, csv

BASE = r"D:\Joe\muse-worktree\tmp\wiring-browser-f40\api\src"
FILES = {
    "registry": "modules/tools/registry.ts",
    "IntentParser": "core/intelligence/IntentParser.ts",
    "PlanningEngine": "core/orchestrator/PlanningEngine.ts",
    "intent-classifier": "core/intelligence/intent-classifier.ts",
    "plan-tools": "core/orchestrator/plan-tools.ts",
    "ToolService": "modules/services/ToolService.ts",
    "PhaseExecutor": "modules/tools/definitions/PhaseExecutorTool.ts",
    "AgentLoop": "modules/services/AgentLoopService.ts",
}
NAMES = ["browser_action","browser_run","browser_vision","browser_extract_data",
"browser_check_links","browser_performance","browser_seo_audit","browser_console_scan",
"browser_save_pdf","browser_readability","browser_contrast_audit","browser_extract_meta",
"browser_compare","browser_summarize","browser_ui_audit","browser_fill_form",
"browser_translate","browser_responsive_check","browser_find_text","browser_design_tokens",
"browser_click","browser_fullpage_shot","browser_smart_agent","browser_autofix",
"browser_consent","browser_search","browser_launch","browser_a11y_deep",
"browser_page_fix","user_browser","visual_qa","web_page_builder"]

texts = {}
for k, rel in FILES.items():
    p = os.path.join(BASE, rel)
    texts[k] = open(p, encoding="utf-8").read() if os.path.exists(p) else ""
    if not texts[k]:
        print("MISSING:", rel)

print("tool,registry,IntentParser,PlanningEngine,classifier,plan-tools,ToolService,PhaseExecutor,AgentLoop")
for n in NAMES:
    print(n + "," + ",".join(str(texts[k].count(n)) for k in FILES))
