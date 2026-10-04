"""Shell-family L3 refcount on exact f40 bytes (read-only)."""
import pathlib, re

ROOT = pathlib.Path(r"D:\Joe\muse-worktree\tmp\wiring-browser-f40\api\src")
NAMES = ["repo_run_command", "npm_manager", "shell_execute", "shell_check_status", "terminal_manager"]

GROUPS = {
    "registry": ["modules/tools/registry.ts"],
    "deterministic_planner": [
        "core/intelligence/IntentParser.ts",
        "core/intelligence/intent-classifier.ts",
        "core/orchestrator/PlanningEngine.ts",
        "core/orchestrator/plan-tools.ts",
        "core/design/app-blueprints.ts",
        "modules/tools/definitions/ProjectPipelineTool.ts",
    ],
    "tool_picker": ["core/llm/tool-picker.ts", "core/orchestrator/tool-rerank.ts"],
    "toolservice": ["modules/services/ToolService.ts"],
    "executor_verify": [
        "modules/tools/definitions/PhaseExecutorTool.ts",
        "core/verification/verification-ledger.ts",
    ],
    "selffix": [
        "core/repair/SelfFixService.ts",
        "core/repair/SelfFixExecutionService.ts",
        "core/repair/RepairTicketService.ts",
    ],
    "engine": [
        "modules/execution/ExecutionEngine.ts",
        "core/execution/ExecutionEngine.ts",
    ],
}

def existing(paths):
    return [ROOT / p for p in paths if (ROOT / p).exists()]

print("group,file,name,count")
for group, paths in GROUPS.items():
    for f in existing(paths):
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for n in NAMES:
            c = len(re.findall(r"\b" + re.escape(n) + r"\b", text))
            if c:
                print(f"{group},{f.name},{n},{c}")

print("--- file census (non-test src) ---")
for n in NAMES:
    files = []
    for f in ROOT.rglob("*.ts"):
        sp = str(f)
        if "node_modules" in f.parts or "__tests__" in f.parts or "tests\\manual" in sp or "tests/manual" in sp:
            continue
        try:
            t = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if re.search(r"\b" + re.escape(n) + r"\b", t):
            files.append(str(f.relative_to(ROOT)))
    print(f"{n}: {len(files)} prod files")
    for x in sorted(files)[:30]:
        print(f"  {x}")
