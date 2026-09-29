// MUSE wiring-audit checkpoint 9: browser_ui trunk batch 1 (READ-ONLY).
// Part A: declarations for the 33 browser_ui trunk names as the RUNTIME
//   sees them (post-enforceContract): permissions/sideEffects/rateLimit/
//   required + description/tags.
// Part B: self-grounded selection verdicts (same method as trunk_files 008).
// Part C: session-input survey from inputSchema properties (which tools
//   declare session-ish inputs, required or optional) + router/priority flags.
// NO live browser execution here: browser_launch stays EMBARGOED (008
// fixture design stands); session-creating tools are surveyed, not called.
// Run from api/: ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_browser1.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'browser_a11y_deep', 'browser_action', 'browser_autofix', 'browser_check_links',
  'browser_click', 'browser_compare', 'browser_consent', 'browser_console_scan',
  'browser_contrast_audit', 'browser_design_tokens', 'browser_extract_data',
  'browser_extract_meta', 'browser_fill_form', 'browser_find_text',
  'browser_fullpage_shot', 'browser_launch', 'browser_page_fix',
  'browser_performance', 'browser_readability', 'browser_responsive_check',
  'browser_run', 'browser_save_pdf', 'browser_search', 'browser_seo_audit',
  'browser_smart_agent', 'browser_summarize', 'browser_translate',
  'browser_ui_audit', 'browser_ui_fix', 'browser_vision', 'screenshot',
  'user_browser', 'visual_compare',
];

const SESSION_KEYS = [
  'sessionid', 'browsersessionid', 'session', 'browserid', 'browser_id',
  'session_id', 'browsersession',
];

function rankOf(picks: Array<{ name: string; score: number }>, name: string): { rank: number; score: number } | null {
  const i = picks.findIndex(p => p.name === name);
  return i < 0 ? null : { rank: i + 1, score: picks[i].score };
}

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`TRUNK_BROWSER1_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_BROWSER1_ABORT missing tool ${n}`); process.exit(1); }
  }
  const contractDefaults = registry.contractDefaults as { permissions: string[]; rateLimit: string[]; unknown: string[] };

  const catalog: any = await imp(path.join(SRC, 'core', 'orchestrator', 'toolCatalog.ts'));
  const selectToolsFor = catalog.selectToolsFor as (goal: string, limit?: number) => Array<{ name: string; score: number }>;
  const excluded: Set<string> = catalog.ROUTER_EXCLUDED as Set<string>;
  const corePinned: Set<string> = new Set<string>(Array.isArray(catalog.CORE_TOOLS) ? catalog.CORE_TOOLS.map(String) : []);
  let priority: Set<string> | null = null;
  try {
    const picker: any = await imp(path.join(SRC, 'core', 'llm', 'tool-picker.ts'));
    const names = picker.PRIORITY_TOOL_NAMES;
    if (Array.isArray(names)) priority = new Set(names.map(String));
  } catch { priority = null; }
  const fullLimit = tools.length;

  const rows: Record<string, any> = {};
  for (const n of TRUNK) {
    const t = byName.get(n);
    const desc: string = String(t?.description || '');
    const firstSentence = desc.split(/(?<=[.])\s/)[0].slice(0, 140).trim();
    const goals = [
      `use ${n.split('_').join(' ')} for this task`,
      firstSentence ? `I need: ${firstSentence}` : `use ${n.split('_').join(' ')}`,
    ];
    const ranks = goals.map(g => {
      const top30 = selectToolsFor(g, 30);
      const all = selectToolsFor(g, fullLimit);
      return { goal: g, rank30: rankOf(top30, n), rankFull: rankOf(all, n) };
    });
    const best30 = Math.min(...ranks.map(r => r.rank30?.rank ?? Infinity));
    const bestFull = Math.min(...ranks.map(r => r.rankFull?.rank ?? Infinity));
    const props = (t?.inputSchema?.properties && typeof t.inputSchema.properties === 'object')
      ? Object.keys(t.inputSchema.properties) : [];
    const required: string[] = Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required.map(String) : [];
    const sessionProps = props.filter(p => SESSION_KEYS.includes(String(p).toLowerCase()));
    const sessionRequired = required.filter(r => SESSION_KEYS.includes(String(r).toLowerCase()));
    rows[n] = {
      descriptionHead: desc.slice(0, 160),
      descLen: desc.length,
      tags: Array.isArray(t?.tags) ? t.tags.map(String) : [],
      required,
      propCount: props.length,
      sessionProps,
      sessionRequired,
      permissions: Array.isArray(t?.permissions) ? t.permissions.map(String) : t?.permissions ?? null,
      sideEffects: Array.isArray(t?.sideEffects) ? t.sideEffects.map(String) : t?.sideEffects ?? null,
      rateLimitPerMinute: t?.rateLimitPerMinute ?? null,
      bootDefaultedPerm: contractDefaults.permissions.includes(n),
      bootDefaultedRate: contractDefaults.rateLimit.includes(n),
      routerExcluded: excluded ? excluded.has(n) : null,
      corePinned: corePinned ? corePinned.has(n) : null,
      priorityListed: priority ? priority.has(n) : null,
      verdict: best30 <= 30 ? 'SELECTABLE_BY_KEYWORD' : (bestFull <= fullLimit ? 'LONG_TAIL_RANKED' : 'UNSELECTABLE_EVEN_SELF_GROUNDED'),
      bestRank30: best30 === Infinity ? null : best30,
      bestRankFull: bestFull === Infinity ? null : bestFull,
      top3SelfName: selectToolsFor(goals[0], 30).slice(0, 3).map(p => `${p.name}:${p.score}`),
    };
  }

  const names = Object.keys(rows);
  const agg = {
    trunk: 'browser_ui',
    members: names.length,
    selectable30: names.filter(n => rows[n].verdict === 'SELECTABLE_BY_KEYWORD'),
    longTail: names.filter(n => rows[n].verdict === 'LONG_TAIL_RANKED'),
    unselectable: names.filter(n => rows[n].verdict === 'UNSELECTABLE_EVEN_SELF_GROUNDED'),
    rank1: names.filter(n => rows[n].bestRank30 === 1),
    withSessionProps: names.filter(n => rows[n].sessionProps.length > 0),
    withSessionRequired: names.filter(n => rows[n].sessionRequired.length > 0),
    noRequired: names.filter(n => rows[n].required.length === 0),
    emptySideEffects: names.filter(n => Array.isArray(rows[n].sideEffects) && rows[n].sideEffects.length === 0),
    bootDefaultedPerm: names.filter(n => rows[n].bootDefaultedPerm),
    routerExcluded: names.filter(n => rows[n].routerExcluded === true),
    corePinned: names.filter(n => rows[n].corePinned === true),
    priorityListed: names.filter(n => rows[n].priorityListed === true),
  };
  const out = { generated: 'checkpoint 9 batch 1 (read-only)', registered: tools.length, agg, rows };
  fs.writeFileSync(path.join(HERE, 'trunk_browser1.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    members: agg.members,
    selectable30: agg.selectable30.length,
    longTail: agg.longTail.length,
    unselectable: agg.unselectable.length,
    rank1: agg.rank1.length,
    withSessionProps: agg.withSessionProps,
    withSessionRequired: agg.withSessionRequired,
    noRequired: agg.noRequired.length,
    routerExcluded: agg.routerExcluded,
    priorityListed: agg.priorityListed,
  }, null, 2));
}

main().catch(e => { console.error('TRUNK_BROWSER1_FAIL', e); process.exit(1); });
