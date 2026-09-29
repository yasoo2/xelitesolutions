// MUSE wiring-audit exposure probe (read-only, no providers, no network).
// Cross-checks planner/provider/alias surfaces against the live registry.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const registered: string[] = (registry.tools as any[]).map(t => t.name);
  const regSet = new Set(registered);

  const picker: any = await imp(path.join(SRC, 'core', 'llm', 'tool-picker.ts'));
  const priority: string[] = picker.PRIORITY_TOOL_NAMES ?? [];
  const priorityMissing = priority.filter(n => !regSet.has(n));

  const catalog: any = await imp(path.join(SRC, 'core', 'orchestrator', 'toolCatalog.ts'));
  const excluded: string[] = [...(catalog.ROUTER_EXCLUDED ?? [])];
  const excludedMissing = excluded.filter(n => !regSet.has(n));
  const coreTools: string[] = catalog.CORE_TOOLS ?? [];
  const coreMissing = coreTools.filter(n => !regSet.has(n));

  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const aliases: Record<string, string> = toolService.TOOL_ALIASES ?? {};
  const aliasEntries = Object.entries(aliases);
  const aliasTargetMissing = aliasEntries.filter(([, v]) => !regSet.has(v)).map(([k, v]) => `${k}->${v}`);
  const aliasSourceRegistered = aliasEntries.filter(([k]) => regSet.has(k)).map(([k]) => k);

  // planner-visible = registered minus router-excluded (keyword router path)
  const plannerVisible = registered.filter(n => !new Set(excluded).has(n));

  const out = {
    generatedAt: new Date().toISOString(),
    registered: registered.length,
    priorityNames: priority.length,
    priorityMissingFromRegistry: priorityMissing,
    routerExcluded: excluded.length,
    routerExcludedMissingFromRegistry: excludedMissing,
    plannerVisibleViaKeywordRouter: plannerVisible.length,
    coreTools: coreTools.length,
    coreToolsMissingFromRegistry: coreMissing,
    aliasCount: aliasEntries.length,
    aliasTargetsMissingFromRegistry: aliasTargetMissing,
    aliasSourcesAlsoRegistered: aliasSourceRegistered,
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'exposure.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    registered: out.registered,
    priority: `${priority.length - priorityMissing.length}/${priority.length}`,
    priorityMissing,
    routerExcluded: excluded.length,
    routerExcludedMissing: excludedMissing,
    plannerVisible: plannerVisible.length,
    aliases: aliasEntries.length,
    aliasTargetsMissing: aliasTargetMissing,
    aliasSourcesAlsoRegistered: aliasSourceRegistered,
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
}

main().catch(e => { console.error('EXPOSURE_FAILED', e); process.exit(1); });
