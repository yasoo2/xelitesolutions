// WIRING-152: image-capability ghost-chain audit (Muse independent).
// Live-grounded: registry.tools, TOOL_ALIASES, PLANNER_TOOL_CATALOGUE and
// resolvePlannedTool are imported live; registry/ToolService/plan-tools/image
// definition files are READ as text. ZERO DISPATCH: no executeTool, no paid
// or network calls (ImageGenerationTool.execute can reach OpenAI/Pollinations,
// so it is NEVER invoked here), no registry mutation. Deterministic stdout
// (canonical JSON, sorted); volatile timings go to stderr only.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const tImport0 = Date.now();
const reg = await import('../../api/src/modules/tools/registry.ts');
const pt = await import('../../api/src/core/orchestrator/plan-tools.ts');
const svc = await import('../../api/src/modules/services/ToolService.ts');
console.error(`importMs=${Date.now() - tImport0}`);

const tools: any[] = Array.isArray(reg.tools) ? reg.tools : [];
const registeredNames: string[] = tools
    .map((t: any) => t?.name)
    .filter((n: any) => typeof n === 'string');
const registeredSet = new Set(registeredNames);

const imageNames = ['image_generate', 'generate_image', 'image_studio', 'image'];
const membership: Record<string, boolean> = {};
for (const n of imageNames) membership[n] = registeredSet.has(n);

const TOOL_ALIASES: Record<string, string> = svc.TOOL_ALIASES || {};
const aliasLookup: Record<string, string | null> = {};
for (const n of imageNames) aliasLookup[n] = (n in TOOL_ALIASES) ? String(TOOL_ALIASES[n]) : null;

const catalogue: Array<{ tool: string; purpose: string }> = Array.isArray(pt.PLANNER_TOOL_CATALOGUE)
    ? pt.PLANNER_TOOL_CATALOGUE
    : [];
const catalogueTools = catalogue.map((c: any) => String(c?.tool || ''));
const catalogueImageHits = catalogueTools.filter((t) => t.toLowerCase().includes('image'));

const resolvePlannedTool = pt.resolvePlannedTool;
const resolveOutcomes: Record<string, unknown> = {};
for (const n of [...imageNames, 'generate an image', 'create a hero image']) {
    try { resolveOutcomes[n] = resolvePlannedTool(n); }
    catch (e: any) { resolveOutcomes[n] = { error: String(e?.message || e) }; }
}

// --- Source reads (text only) ---
const apiSrc = path.resolve(here, '../../api/src');
function readSha(rel: string): { text: string; sha256: string } {
    const text = fs.readFileSync(path.join(apiSrc, rel), 'utf8');
    return { text, sha256: crypto.createHash('sha256').update(text).digest('hex') };
}
const registry = readSha('modules/tools/registry.ts');
const toolService = readSha('modules/services/ToolService.ts');
const planTools = readSha('core/orchestrator/plan-tools.ts');
const imgGen = readSha('modules/tools/definitions/ImageGenerationTool.ts');
const imgStudio = readSha('modules/tools/definitions/ImageStudioTool.ts');

const registryImgGenOccurrences = (registry.text.match(/ImageGenerationTool/g) || []).length;
const registryImgStudioOccurrences = (registry.text.match(/ImageStudioTool/g) || []).length;
const registryImgGenCreateTool = /createTool\(\s*ImageGenerationTool\s*\)/.test(registry.text);
const registryImgGenSafeNew = /safeNew\(\s*['"]generate_image['"]/.test(registry.text);
const registryImgStudioCreateTool = /createTool\(\s*ImageStudioTool\s*\)/.test(registry.text);

const redirectBlock = /if\s*\(\s*name\s*===\s*'image_generate'\s*\)\s*\{\s*effectiveName\s*=\s*'generate_image'/.test(toolService.text);
const planToolsImageOccurrences = (planTools.text.match(/image/gi) || []).length;

const imgGenRegisteredName = (imgGen.text.match(/name:\s*'([^']+)'/) || [])[1] || null;
const imgStudioRegisteredName = (imgStudio.text.match(/name\s*=\s*'([^']+)'|name:\s*'([^']+)'/) || []).filter(Boolean)[1] || null;
const imgGenPaidPath = imgGen.text.includes('OPENAI_API_KEY') && imgGen.text.includes('dall-e-3');
const imgGenFallbackPath = imgGen.text.includes('image.pollinations.ai');

const out = {
    registeredCount: registeredNames.length,
    membership,
    aliasLookup,
    catalogueImageHits,
    planToolsImageOccurrences,
    registryImgGenOccurrences,
    registryImgStudioOccurrences,
    registryImgGenCreateTool,
    registryImgGenSafeNew,
    registryImgStudioCreateTool,
    toolServiceRedirectImageGenerate: redirectBlock,
    imgGenRegisteredName,
    imgStudioRegisteredName,
    imgGenPaidPath,
    imgGenFallbackPath,
    resolveOutcomes,
    sha: {
        registryTs: registry.sha256,
        toolServiceTs: toolService.sha256,
        planToolsTs: planTools.sha256,
        imageGenerationToolTs: imgGen.sha256,
        imageStudioToolTs: imgStudio.sha256,
    },
};
console.log(JSON.stringify(out, null, 1));
