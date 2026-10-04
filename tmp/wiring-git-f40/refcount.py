"""Git-family L3 refcount on exact f40 bytes (read-only)."""
import pathlib, re, csv

ROOT = pathlib.Path(r"D:\Joe\muse-worktree\tmp\wiring-browser-f40\api\src")
NAMES = ["git_ops", "git_local_workflow", "github_repo_manager", "github_pr", "github_actions"]

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
}

def existing(paths):
    out = []
    for p in paths:
        f = ROOT / p
        if f.exists():
            out.append(f)
    return out

print("group,file,name,count")
rows = []
for group, paths in GROUPS.items():
    for f in existing(paths):
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for n in NAMES:
            c = len(re.findall(r"\b" + re.escape(n) + r"\b", text))
            if c:
                rows.append((group, f.name, n, c))
                print(f"{group},{f.name},{n},{c}")

# Whole-src file-count census per name (which files mention each name at all)
print("--- file census ---")
for n in NAMES:
    files = []
    for f in ROOT.rglob("*.ts"):
        if "node_modules" in f.parts or "__tests__" in f.parts or "tests/manual" in str(f):
            continue
        try:
            t = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if re.search(r"\b" + re.escape(n) + r"\b", t):
            files.append(str(f.relative_to(ROOT)))
    print(f"{n}: {len(files)} prod files")
    for x in sorted(files)[:25]:
        print(f"  {x}")
