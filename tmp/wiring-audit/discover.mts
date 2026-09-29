// MUSE wiring-audit discovery PROBE (read-only, no providers, no network).
// Run: ..\node_modules\.bin\tsx.cmd tmp\wiring-audit\discover.mts  (from api/)
// Evidence for CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT, Muse portion.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DEF_DIR = path.join(ROOT, 'api', 'src', 'modules', 'tools', 'definitions');

async function main() {
  const out: any = { generatedAt: new Date().toISOString(), worktree: ROOT };

  // 1. Raw definition files
  const defFiles = fs.readdirSync(DEF_DIR).filter(f => f.endsWith('.ts')).sort();
  out.rawDefinitionFiles = defFiles.length;
  out.definitionFiles = defFiles;

  // 2. Exported Tool symbols per file (static, structural)
  const exportRe = /export\s+(?:default\s+)?(?:class|const|function)\s+([A-Za-z0-9_]*Tool[A-Za-z0-9_]*)/g;
  const definedSymbols: Record<string, string[]> = {};
  let totalSymbols = 0;
  for (const f of defFiles) {
    const src = fs.readFileSync(path.join(DEF_DIR, f), 'utf8');
    const names: string[] = [];
    let m: RegExpExecArray | null;
    exportRe.lastIndex = 0;
    while ((m = exportRe.exec(src)) !== null) names.push(m[1]);
    definedSymbols[f] = [...new Set(names)];
    totalSymbols += definedSymbols[f].length;
  }
  out.exportedToolSymbols = totalSymbols;
  out.symbolsByFile = definedSymbols;

  // 3. Live registry (runtime truth)
  const registry = await import(pathToFileURL(path.join(ROOT, 'api', 'src', 'modules', 'tools', 'registry.ts')).href);
  const tools = registry.tools as Array<{ name: string; execute?: unknown; permissions?: unknown[]; rateLimitPerMinute?: number }>;
  out.registeredTools = tools.length;
  out.registeredNames = tools.map(t => t.name).sort();
  out.withExecute = tools.filter(t => typeof (t as any).execute === 'function').length;
  out.withoutExecute = out.registeredTools - out.withExecute;
  out.missingExecuteNames = tools.filter(t => typeof (t as any).execute !== 'function').map(t => t.name).sort();
  out.contractDefaults = registry.contractDefaults ?? null;

  // duplicate names?
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const t of tools) { if (seen.has(t.name)) dupes.push(t.name); seen.add(t.name); }
  out.duplicateRegisteredNames = dupes;

  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'discovery.json');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(`definitionFiles=${out.rawDefinitionFiles} exportedSymbols=${totalSymbols} registered=${out.registeredTools} withExecute=${out.withExecute} withoutExecute=${out.withoutExecute} dupes=${dupes.length}`);
  console.log(`wrote ${jsonPath}`);
}

main().catch(e => { console.error('DISCOVERY_FAILED', e); process.exit(1); });
