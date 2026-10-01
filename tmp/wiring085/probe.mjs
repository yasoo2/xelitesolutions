import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
// WIRING-085 (MUSE): currency re-verification on exact HEAD + open-finding locks.
// Read-only: one registry import (no execution), source scans, no network.
const out = { checks: [] };
function check(name, cond, detail) { out.checks.push({ name, pass: !!cond, detail: detail ?? null }); }

// --- 084 currency rerun ---
const reg = await import("file:///D:/Joe/muse-worktree/api/src/modules/tools/registry.ts");
const tools = reg.tools || [];
check("registered_163", tools.length === 163, "registered=" + tools.length);
const byName = new Map(tools.map(t => [t.name, t]));
const WRITE5 = ["web_page_builder", "alert_manager", "cache_manager", "project_state_manager", "template_manager"];
const READ16 = ["business_logic_parser", "chaos_test_plan", "compliance_validator", "cloud_cost_estimator",
  "ambiguity_resolver", "multi_agent_debate", "self_confidence_evaluator", "project_planner",
  "central_answer", "form_inbox", "echo", "shell_check_status", "ask_user",
  "json_query", "monitoring", "request_analyzer"];
check("write5_labels", WRITE5.every(n => JSON.stringify((byName.get(n) || {}).permissions) === JSON.stringify(["write"])),
  WRITE5.map(n => n + "=" + JSON.stringify((byName.get(n) || {}).permissions)).join(" "));
check("read16_labels", READ16.every(n => JSON.stringify((byName.get(n) || {}).permissions) === JSON.stringify(["read"])),
  "all16=" + READ16.every(n => JSON.stringify((byName.get(n) || {}).permissions) === JSON.stringify(["read"])));

const DEF = "D:/Joe/muse-worktree/api/src/modules/tools/definitions/";
function decls(file) {
  const src = readFileSync(DEF + file, "utf8");
  const pm = src.match(/permissions\s*=\s*(\[[^\]]*\])/);
  const sm = src.match(/sideEffects\s*=\s*(\[[^\]]*\])/);
  return { permissions: pm ? pm[1] : "?", sideEffects: sm ? sm[1] : "?" };
}
for (const f of ["TemplateManagerTool.ts", "CacheManagerTool.ts", "WebPageBuilderTool.ts", "MonitoringTool.ts"]) {
  const d = decls(f);
  check("declared_empty_" + f.replace("Tool.ts", "").toLowerCase(),
    d.permissions === "[]" && d.sideEffects === "[]", f + " perms=" + d.permissions + " fx=" + d.sideEffects);
}
for (const f of ["AlertManagerTool.ts", "ProjectStateManagerTool.ts"]) {
  const d = decls(f);
  check("declared_writefx_" + f.replace("Tool.ts", "").toLowerCase(),
    d.permissions === "[]" && d.sideEffects.includes("write"), f + " perms=" + d.permissions + " fx=" + d.sideEffects);
}
const monHash = createHash("sha256").update(readFileSync(DEF + "MonitoringTool.ts")).digest("hex");
check("monitoring_blob_unchanged", monHash.toUpperCase() === "BBBEAAA712061A8440A82300585D69800CA2415687585B713A10EDA913B9DCA3", monHash.slice(0, 16));

const ts = readFileSync("D:/Joe/muse-worktree/api/src/modules/services/ToolService.ts", "utf8");
const autoIdx = ts.indexOf("default-workspace");
const fwIdx = ts.indexOf("workspace_required");
check("f0821_auto_assign_before_firewall", autoIdx !== -1 && fwIdx !== -1 && autoIdx < fwIdx,
  "autoAssign@" + autoIdx + " firewall@" + fwIdx);
check("f0821_session_prefix_present", ts.includes("session-"), "session- prefix literal present");

// --- Finding locks (072/073) ---
const regSrc = readFileSync("D:/Joe/muse-worktree/api/src/modules/tools/registry.ts", "utf8");
function orphanLock(toolName, importSymbol, defFile) {
  const imported = importSymbol ? regSrc.includes(importSymbol) : null;
  const registered = byName.has(toolName);
  const implemented = readFileSync(DEF + defFile, "utf8").includes(toolName);
  check("orphan_lock_" + toolName, implemented && !registered,
    "implemented=" + implemented + " imported=" + imported + " registered=" + registered);
  return { imported, registered };
}
orphanLock("generate_image", "ImageGenerationTool", "ImageGenerationTool.ts");
orphanLock("codebase_navigator", "CodebaseNavigatorTool", "CodebaseNavigatorTool.ts");
orphanLock("bulk_file_generator", "BulkFileGeneratorTool", "BulkFileGeneratorTool.ts");
orphanLock("visual_qa", null, "VisualQATool.ts"); // import presence recorded in detail via registry scan below
check("visual_qa_import_scan", true, "registryMentionsVisualQA=" + regSrc.includes("VisualQA"));

// W73-5: shell_status offered to planner but unmapped
const picker = readFileSync("D:/Joe/muse-worktree/api/src/core/llm/tool-picker.ts", "utf8");
const offered = picker.includes("shell_status");
const mappedInTS = /shell_status/.test(ts);
const realNameRegistered = byName.has("shell_check_status");
check("w735_shell_status_gap", offered && !mappedInTS && realNameRegistered,
  "offered=" + offered + " mappedInToolService=" + mappedInTS + " shell_check_status_registered=" + realNameRegistered);

// W73-3: stale-green self-pinning test + real table divergence
const staleTest = readFileSync("D:/Joe/muse-worktree/api/src/__tests__/tool-aliases.test.ts", "utf8");
const selfPins = staleTest.includes("grep_search: 'search_files'");
const importsRealTable = /from .*TOOL_ALIASES|import .*TOOL_ALIASES/.test(staleTest);
const realTableMaps = /grep_search['"]?\s*:\s*['"]search_text['"]/.test(ts);
check("w733_stale_green", selfPins && !importsRealTable && realTableMaps,
  "selfPinsSearchFiles=" + selfPins + " importsRealTable=" + importsRealTable + " realTableToSearchText=" + realTableMaps);

console.log(JSON.stringify(out, null, 1));
const fails = out.checks.filter(c => !c.pass);
if (fails.length) { console.error("FAILURES:" + fails.length); process.exit(1); }
console.log("ALL_PASS");
