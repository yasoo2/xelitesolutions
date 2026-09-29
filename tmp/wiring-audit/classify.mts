// MUSE wiring-audit classification probe (read-only, no providers, no network).
// Checkpoint 2: per-symbol reconciliation + dormant-name classification + catalogue coverage.
// Run from api/: ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\classify.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const DEF_DIR = path.join(SRC, 'modules', 'tools', 'definitions');
const imp = (p: string) => import(pathToFileURL(p).href);

const CORPUS: string[] = [
  'Build a TypeScript CLI that reads a CSV file and prints a summary table',
  'Create a landing page for a coffee shop with photos and a contact form',
  'Fix the failing login test in the web app',
  'Summarize the content of this page in one sentence',
  'لخّص محتوى الصفحة',
  'ابنِ صفحة هبوط لمتجر قهوة مع صور',
  'Open the dashboard in the browser and click the export button',
  'Check the mobile layout of the homepage at 390px wide',
  'Deploy the site to static hosting',
  'Search the codebase for the password validation logic',
  'Find all files that import the router module',
  'Run the test suite and report failures',
  'Generate an image of a mountain lake for the hero section',
  'What is 2+2? Answer in one word.',
  'Inspect the orders database and list yesterday’s revenue',
  'Migrate the database schema to add an email column',
  'Review this pull request for security issues',
  'Translate the README to Arabic',
  'Monitor the API logs for errors in the last hour',
  'Create a new git branch and commit these changes',
];

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const registered: string[] = (registry.tools as any[]).map(t => t.name);
  const regSet = new Set(registered);

  // 1. Per-symbol reconciliation: name literals per definition file
  const defFiles = fs.readdirSync(DEF_DIR).filter(f => f.endsWith('.ts')).sort();
  const nameRe = /(?:^|[^\w$])(?:readonly\s+)?name\s*[:=]\s*['"]([a-z0-9_]+)['"]/gm;
  const literalToFiles: Record<string, string[]> = {};
  for (const f of defFiles) {
    const src = fs.readFileSync(path.join(DEF_DIR, f), 'utf8');
    let m: RegExpExecArray | null;
    nameRe.lastIndex = 0;
    const seen = new Set<string>();
    while ((m = nameRe.exec(src)) !== null) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      (literalToFiles[m[1]] = literalToFiles[m[1]] || []).push(f);
    }
  }
  const literals = Object.keys(literalToFiles).sort();
  const definedNotRegistered = literals.filter(n => !regSet.has(n));
  const registeredNoLiteral = registered.filter(n => !literalToFiles[n]).sort();

  // 2. Dormant priority-name classification
  const picker: any = await imp(path.join(SRC, 'core', 'llm', 'tool-picker.ts'));
  const priority: string[] = picker.PRIORITY_TOOL_NAMES ?? [];
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const aliases: Record<string, string> = toolService.TOOL_ALIASES ?? {};
  // hard name rewrites of the form: if (name === 'x') { effectiveName = 'y'; }
  const tsSrc = fs.readFileSync(path.join(SRC, 'modules', 'services', 'ToolService.ts'), 'utf8');
  const rewrites: Record<string, string> = {};
  const rwRe = /if\s*\(\s*name\s*===\s*['"]([a-z0-9_]+)['"]\s*\)\s*\{\s*effectiveName\s*=\s*['"]([a-z0-9_]+)['"]/g;
  let rwm: RegExpExecArray | null;
  while ((rwm = rwRe.exec(tsSrc)) !== null) rewrites[rwm[1]] = rwm[2];
  const stem = (n: string) => n.split('_').filter(w => !['tool', 'the', 'a'].includes(w));
  const overlap = (a: string, b: string) => {
    const A = new Set(stem(a)); const B = new Set(stem(b));
    let n = 0; for (const w of A) if (B.has(w)) n++;
    return n;
  };
  const classified: Record<string, any> = {};
  for (const n of priority.filter(x => !regSet.has(x))) {
    if (aliases[n] && regSet.has(aliases[n])) {
      classified[n] = { class: 'ALIAS_COVERED', target: aliases[n] };
    } else if (rewrites[n]) {
      classified[n] = { class: rewrites[n] && regSet.has(rewrites[n]) ? 'REWRITE_COVERED' : 'REWRITE_BROKEN', target: rewrites[n] };
    } else {
      const cands = registered
        .map(r => ({ r, s: overlap(n, r) }))
        .filter(x => x.s >= 1)
        .sort((a, b) => b.s - a.s || a.r.localeCompare(b.r))
        .slice(0, 3)
        .map(x => x.r);
      classified[n] = { class: cands.length ? 'ABSENT_STATIC_CANDIDATES' : 'ABSENT_NO_CANDIDATE', staticCandidates: cands };
    }
  }

  // 3. Catalogue coverage over the corpus (deterministic, no model)
  const catalog: any = await imp(path.join(SRC, 'core', 'orchestrator', 'toolCatalog.ts'));
  const seen = new Set<string>();
  const perGoal: Record<string, string[]> = {};
  for (const g of CORPUS) {
    const picks: Array<{ name: string }> = catalog.selectToolsFor(g, 30);
    perGoal[g] = picks.map(p => p.name);
    for (const p of picks) seen.add(p.name);
  }
  const absent = registered.filter(n => !seen.has(n)).sort();

  const out = {
    generatedAt: new Date().toISOString(),
    registered: registered.length,
    literalNames: literals.length,
    definedNotRegistered: definedNotRegistered.map(n => ({ name: n, files: literalToFiles[n] })),
    registeredNoLiteralFactoryOrDynamic: registeredNoLiteral,
    hardRewrites: rewrites,
    dormantClassification: classified,
    corpusSize: CORPUS.length,
    catalogueSelectedAtLeastOnce: seen.size,
    catalogueAbsent: absent,
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'classification.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    registered: out.registered,
    literals: out.literalNames,
    definedNotRegistered: definedNotRegistered,
    registeredNoLiteral: registeredNoLiteral,
    rewrites,
    dormant: classified,
    catalogueCoverage: `${seen.size}/${registered.length}`,
    catalogueAbsentCount: absent.length,
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
}

main().catch(e => { console.error('CLASSIFY_FAILED', e); process.exit(1); });
