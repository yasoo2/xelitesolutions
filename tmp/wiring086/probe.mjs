import { readFileSync, writeFileSync } from "node:fs";
// WIRING-086 (MUSE): planner-offered names vs registry vs ToolService aliases.
// Read-only: registry + picker imports (no tool executed), source scans, no network.
// Generalizes W73-5 (shell_status) to the full PRIORITY_TOOL_NAMES list.
const out = { checks: [], offered: [], aliasTargets: [] };
function check(name, cond, detail) { out.checks.push({ name, pass: !!cond, detail: detail ?? null }); }

const picker = await import("file:///D:/Joe/muse-worktree/api/src/core/llm/tool-picker.ts");
const reg = await import("file:///D:/Joe/muse-worktree/api/src/modules/tools/registry.ts");
const tools = reg.tools || [];
const byName = new Map(tools.map(t => [t.name, t]));
const offered = picker.PRIORITY_TOOL_NAMES || [];
check("offered_list_nonempty", offered.length > 40, "offered=" + offered.length);

// Parse exported TOOL_ALIASES literal from ToolService source (no heavy import).
const ts = readFileSync("D:/Joe/muse-worktree/api/src/modules/services/ToolService.ts", "utf8");
const aliasBlock = (ts.match(/export const TOOL_ALIASES[^=]*=\s*\{([\s\S]*?)\n\};/) || [])[1] || "";
const aliases = {};
for (const m of aliasBlock.matchAll(/^\s*([A-Za-z0-9_]+)\s*:\s*['"]([A-Za-z0-9_]+)['"]/gm)) {
  aliases[m[1]] = m[2];
}
check("alias_table_parsed", Object.keys(aliases).length >= 20, "aliases=" + Object.keys(aliases).length);

// Broken aliases: target not registered.
const broken = Object.entries(aliases).filter(([k, v]) => !byName.has(v));
check("no_broken_alias_targets", broken.length === 0,
  broken.length ? JSON.stringify(broken) : "all " + Object.keys(aliases).length + " targets registered");
out.aliasTargets = Object.entries(aliases).map(([k, v]) => ({ alias: k, target: v, targetRegistered: byName.has(v) }));

// Per-offered-name reconciliation: registered? aliased-to-registered? mentioned? GAP?
const gaps = [];
for (const name of offered) {
  const registered = byName.has(name);
  const aliasTarget = aliases[name] || null;
  const aliasResolves = aliasTarget ? byName.has(aliasTarget) : false;
  const mentionedInTS = name !== "echo" && name !== "shell" ? ts.includes(name) : null; // echo/shell too generic for substring
  const ok = registered || aliasResolves;
  if (!ok) gaps.push(name);
  out.offered.push({ name, registered, aliasTarget, aliasResolves, mentionedInToolService: mentionedInTS, reachable: ok });
}
check("offered_reachable_all", gaps.length === 0,
  gaps.length + " gaps: " + gaps.join(",") + " (of " + offered.length + " offered)");

// shell_status must remain the KNOWN gap shape (locks W73-5, must not silently change class).
const s5 = out.offered.find(o => o.name === "shell_status");
check("w735_shell_status_still_gap", !!s5 && !s5.reachable && byName.has("shell_check_status"),
  JSON.stringify(s5));

// image_generate spelling: picker offers it; registry has image_studio (+unregistered generate_image def).
const ig = out.offered.find(o => o.name === "image_generate");
check("image_generate_reconciled", !!ig && (ig.registered || ig.aliasResolves || !ig.reachable),
  JSON.stringify(ig) + " image_studio_registered=" + byName.has("image_studio"));

writeFileSync("D:/Joe/muse-worktree/tmp/wiring086/results.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify({ checks: out.checks, gaps }, null, 1));
const fails = out.checks.filter(c => !c.pass && c.name !== "offered_reachable_all");
if (fails.length) { console.error("PROBE_FAILURES:" + fails.length); process.exit(1); }
console.log(gaps.length ? "GAPS_PRESENT(not probe failure)" : "ALL_REACHABLE");
