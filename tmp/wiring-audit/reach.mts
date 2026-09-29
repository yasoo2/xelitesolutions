// MUSE wiring-audit reachability probe (read-only, no providers, no network).
// Checkpoint 3: (A) multi-name rewrite-condition classification with
// registration truth for every source/target name; (B) per-name reachability
// stories for the 15 catalogue-absent tools; (C) inline-handler shadowing check.
// Run from api/: ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\reach.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

// Static classification from ToolService.ts source reading (Muse branch).
// class: PURE_RENAME | RENAME_SHAPING | SHAPING_ONLY | CONDITIONAL | INLINE_EXEC
type RewriteCase = {
  line: number; names: string[]; target: string | null; class: string; note: string;
  identity?: string[]; // sources that map to themselves (shaping only, registry entry used)
};
const CASES: RewriteCase[] = [
  { line: 74, names: ['browser_run', 'browser_open', 'visual_qa'], target: null, class: 'SHAPING_ONLY', note: 'rate-limit bucket key only; no rename' },
  { line: 406, names: ['npm_install', 'install_package'], target: 'npm_manager', class: 'RENAME_SHAPING', note: '+command=install default' },
  { line: 429, names: ['command_execute', 'run_command', 'exec', 'terminal'], target: 'shell_execute', class: 'PURE_RENAME', note: '' },
  { line: 432, names: ['manual_test', 'verify_build'], target: 'project_detect', class: 'PURE_RENAME', note: 'safe fallback per comment' },
  { line: 438, names: ['file_write', 'write_to_file', 'create_file', 'ai_write_file'], target: 'write_file', class: 'RENAME_SHAPING', note: 'ai_write_file maps to itself (shaping only); others contained via containPath', identity: ['ai_write_file'] },
  { line: 477, names: ['edit_file', 'modify_file', 'file_edit'], target: 'file_edit', class: 'RENAME_SHAPING', note: 'edit_file is identity rename; containment shaping' },
  { line: 488, names: ['file_read', 'read_file', 'view_file', 'get_file'], target: 'read_file', class: 'RENAME_SHAPING', note: 'read_file is identity rename; containment shaping' },
  { line: 499, names: ['audit', 'dependency_scan', 'security_audit'], target: 'dependency_audit', class: 'PURE_RENAME', note: '' },
  { line: 502, names: ['run_quality', 'lint_project'], target: 'quality_run', class: 'PURE_RENAME', note: '' },
  { line: 505, names: ['detect_project', 'scan_project'], target: 'project_detect', class: 'PURE_RENAME', note: '' },
  { line: 508, names: ['web_pipeline', 'scaffold_website'], target: 'website_full_pipeline', class: 'PURE_RENAME', note: '' },
  { line: 519, names: ['list_files', 'list_directory', 'dir'], target: 'inspect_directory', class: 'RENAME_SHAPING', note: '+depth=1 default' },
  { line: 526, names: ['search_code', 'find_in_files', 'grep', 'grep_search'], target: 'search_text', class: 'PURE_RENAME', note: 'deliberate one-hop per comment; orphans GrepSearchTool impl' },
  { line: 529, names: ['browse', 'open_browser', 'web_browse'], target: 'browser_run', class: 'PURE_RENAME', note: 'no action shaping; empty actions+no instructionText fails honest (BrowserRunTool:331)' },
  { line: 532, names: ['git_commit', 'commit'], target: 'git_ops', class: 'RENAME_SHAPING', note: '+operation=commit' },
  { line: 536, names: ['git_push', 'push'], target: 'git_ops', class: 'RENAME_SHAPING', note: '+operation=push' },
  { line: 390, names: ['scaffold_full_stack'], target: 'react_project', class: 'CONDITIONAL', note: 'only when input is frontendish && !backendish' },
  { line: 547, names: ['github_repo_manager'], target: 'git_ops', class: 'CONDITIONAL', note: 'only when input.action=push; +operation=push' },
  { line: 571, names: ['recall_memory'], target: null, class: 'INLINE_EXEC', note: 'returns before registry/firewall; registry def shadowed' },
  { line: 583, names: ['memorize_codebase'], target: null, class: 'INLINE_EXEC', note: 'returns before registry/firewall; registry def shadowed' },
];

// Checkpoint-2 single-name renames, re-verified here with registration truth.
const SINGLES: Array<{ line: number; name: string; target: string }> = [
  { line: 344, name: 'browser_open', target: 'browser_run' },
  { line: 354, name: 'browser_get_state', target: 'browser_run' },
  { line: 361, name: 'browser_snapshot', target: 'browser_run' },
  { line: 368, name: 'web_search', target: 'browser_run' },
  { line: 410, name: 'npm_build', target: 'npm_manager' },
  { line: 415, name: 'npm_run', target: 'npm_manager' },
  { line: 419, name: 'npm_start', target: 'npm_manager' },
  { line: 424, name: 'npm_test', target: 'npm_manager' },
  { line: 435, name: 'project_scaffold', target: 'scaffold_project' },
  { line: 511, name: 'read_file_tree', target: 'inspect_directory' },
  { line: 542, name: 'github_create_repo', target: 'github_repo_manager' },
  { line: 551, name: 'image_generate', target: 'generate_image' },
];

const ABSENT_15 = [
  'ambiguity_resolver', 'ask_user', 'cloud_cost_estimator', 'docker_swarm_ops',
  'execute_python', 'json_query', 'kubernetes_ops', 'llm_cache',
  'multi_agent_debate', 'project_planner', 'rss_fetch',
  'self_confidence_evaluator', 'task_lifecycle', 'template_manager', 'video_action',
];

const DETERMINISTIC_FILES = [
  'core/orchestrator/PlanningEngine.ts',
  'core/orchestrator/plan-tools.ts',
  'core/orchestrator/toolCatalog.ts',
  'core/llm/tool-picker.ts',
  'modules/tools/definitions/ProjectPipelineTool.ts',
  'modules/tools/definitions/ProjectPlannerTool.ts',
  'modules/tools/definitions/PhaseExecutorTool.ts',
  'modules/services/AgentLoopService.ts',
];

function countRefs(fileAbs: string, name: string): number {
  const src = fs.readFileSync(fileAbs, 'utf8');
  const re = new RegExp(`['"\`\\s=(:,]${name}['"\`\\s=,);:]`, 'g');
  return (src.match(re) || []).length;
}

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  const regSet = new Set<string>(tools.map(t => t.name));
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));

  const catalog: any = await imp(path.join(SRC, 'core', 'orchestrator', 'toolCatalog.ts'));
  const excluded: Set<string> = catalog.ROUTER_EXCLUDED ?? new Set();
  const coreTools: string[] = catalog.CORE_TOOLS ?? [];
  const picker: any = await imp(path.join(SRC, 'core', 'llm', 'tool-picker.ts'));
  const priority: string[] = picker.PRIORITY_TOOL_NAMES ?? [];
  const priSet = new Set(priority);

  // A. rewrite matrix. Identity renames (source === target) USE the registry
  // entry (shaping only) and are NOT shadowed. Conditional renames shadow
  // only for matching inputs. Inline execs are reported separately in C.
  const matrix = CASES.map(c => ({
    line: c.line, class: c.class, target: c.target,
    targetRegistered: c.target ? regSet.has(c.target) : null,
    sources: c.names.map(n => ({ name: n, registered: regSet.has(n) })),
    identityShaped: c.names.filter(n => regSet.has(n) && (n === c.target || (c.identity || []).includes(n))),
    conditionalShadow: c.class === 'CONDITIONAL' ? c.names.filter(n => regSet.has(n)) : [],
    fullShadow: c.class !== 'CONDITIONAL' && c.class !== 'INLINE_EXEC' && c.class !== 'SHAPING_ONLY'
      ? c.names.filter(n => regSet.has(n) && c.target && n !== c.target && !(c.identity || []).includes(n)) : [],
    note: c.note,
  }));
  const shadowed = matrix.flatMap(m => m.fullShadow.map(n => ({
    name: n, via: `ToolService:${m.line}`, winner: m.target,
  })));
  const conditionalShadow = matrix.flatMap(m => m.conditionalShadow.map(n => ({
    name: n, via: `ToolService:${m.line} (input-conditional)`, winner: m.target,
  })));
  const singles = SINGLES.map(s => ({
    ...s,
    sourceRegistered: regSet.has(s.name),
    targetRegistered: regSet.has(s.target),
  }));

  // B. reachability stories
  const stories: Record<string, any> = {};
  for (const n of ABSENT_15) {
    const t = byName.get(n);
    const detRefs: Record<string, number> = {};
    for (const f of DETERMINISTIC_FILES) {
      const c = countRefs(path.join(SRC, f), n);
      if (c > 0) detRefs[f] = c;
    }
    stories[n] = {
      registered: !!t,
      hasExecute: !!(t && typeof t.execute === 'function'),
      permissions: t?.permissions ?? null,
      routerExcluded: excluded.has(n),
      priorityListed: priSet.has(n),
      coreListed: coreTools.includes(n),
      deterministicRefs: detRefs,
    };
  }

  // C. inline shadow check
  const inline = ['recall_memory', 'memorize_codebase'].map(n => {
    const t = byName.get(n);
    return {
      name: n, registered: !!t,
      registryHasExecute: !!(t && typeof t.execute === 'function'),
      registryPermissions: t?.permissions ?? null,
      inlineHandledInToolService: true, // observed: ToolService.ts:571/583 returns before registry+firewall
      verdict: t ? 'SHADOWED_REGISTRY_DEF' : 'HIDDEN_UNREGISTERED_EXEC',
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    registered: regSet.size,
    rewriteMatrix: matrix,
    shadowedRegistryEntries: shadowed,
    conditionalShadow,
    singleRenames: singles,
    catalogueAbsentStories: stories,
    inlineShadow: inline,
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'reachability.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    registered: out.registered,
    cases: matrix.length,
    shadowedRegistryEntries: shadowed,
    conditionalShadow,
    singleRenames: singles,
    inlineShadow: inline,
    stories,
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
}

main().catch(e => { console.error('REACH_FAILED', e); process.exit(1); });
