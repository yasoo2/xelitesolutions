// WIRING-146 recall diagnostic: closes the bare-word blind spot of the
// quoted+regex-span census. Tokenizes EVERY word in ProjectPlannerTool.ts
// and reports tokens in (registered ∪ aliasKeys ∪ catalogue) that the
// census did NOT capture, with live resolvePlannedTool verdicts. Also
// intersects nonVocab census literals against equals-style `name = 'xxx'`
// def-site names (the census `name:` scan misses `name =` style, e.g. the
// planner's own self-name). Read-only: target file is READ as text, no
// dispatch, no writes, no registry mutation. Deterministic stdout.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const tImport0 = Date.now();
const reg = await import('../../api/src/modules/tools/registry.ts');
const pt = await import('../../api/src/core/orchestrator/plan-tools.ts');
const svc = await import('../../api/src/modules/services/ToolService.ts');
console.error(`importMs=${Date.now() - tImport0}`);

const tools: any[] = Array.isArray(reg.tools) ? reg.tools : [];
const registeredSet = new Set(
    tools.map((t: any) => t?.name).filter((n: any) => typeof n === 'string'),
);
const TOOL_ALIASES: Record<string, string> = svc.TOOL_ALIASES || {};
const aliasKeys = new Set(Object.keys(TOOL_ALIASES));
const catalogue: Array<{ tool: string }> = Array.isArray(pt.PLANNER_TOOL_CATALOGUE)
    ? pt.PLANNER_TOOL_CATALOGUE
    : [];
const catalogueSet = new Set(catalogue.map((c: any) => String(c?.tool || '')));
const vocab = new Set<string>([...registeredSet, ...aliasKeys, ...catalogueSet]);

// Census rows (run1) for set-difference.
const censusLog = fs.readFileSync(path.join(here, 'run1.stdout.log'), 'utf8')
    .split('\n').slice(2).join('\n');
const census = JSON.parse(censusLog);
const censusNames: Set<string> = new Set(census.rows.map((r: any) => String(r.name)));
const censusNonVocab: Array<{ name: string; lines: number[] }> = [
    ...census.nonVocabUnderscoreLiterals,
    ...census.nonVocabPlainLiterals,
];

// Full word tokenization of the planner file.
const plannerText = fs.readFileSync(
    path.resolve(here, '../../api/src/modules/tools/definitions/ProjectPlannerTool.ts'),
    'utf8',
);
const plannerLines = plannerText.split('\n');
const TOOL_SHAPE = /^[a-z][a-z0-9_]{2,}$/;
const tokenLines = new Map<string, number[]>(); // token -> sorted unique lines
plannerLines.forEach((ln, i) => {
    for (const m of ln.matchAll(/[A-Za-z0-9_]+/g)) {
        const tok = m[0].toLowerCase();
        if (!TOOL_SHAPE.test(tok)) continue;
        const list = tokenLines.get(tok) || [];
        if (!list.includes(i + 1)) list.push(i + 1);
        tokenLines.set(tok, list);
    }
});

// Recall gap: vocab tokens the census never captured.
type Gap = { name: string; lines: number[]; registered: boolean; aliasKey: boolean; inCatalogue: boolean; resolvedTool: string | null; resolveHow: string | null; verdict: string };
const gaps: Gap[] = [];
for (const [tok, lines] of [...tokenLines.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (!vocab.has(tok) || censusNames.has(tok)) continue;
    const res: any = pt.resolvePlannedTool(tok);
    const registered = registeredSet.has(tok);
    const aliasKey = aliasKeys.has(tok);
    let verdict = 'UNCLASSIFIED';
    if (registered && res?.tool === tok && res?.how === 'exact') verdict = 'REGISTERED_EXACT';
    else if (aliasKey) verdict = 'ALIAS_KEY';
    else if (registered) verdict = 'REGISTERED_NONEXACT';
    else verdict = 'CATALOGUE_ONLY';
    gaps.push({
        name: tok, lines, registered, aliasKey, inCatalogue: catalogueSet.has(tok),
        resolvedTool: res?.tool ?? null, resolveHow: res?.how ?? null, verdict,
    });
}

// Equals-style def names vs census nonVocab literals.
const defsDir = path.resolve(here, '../../api/src/modules/tools/definitions');
const eqNames = new Map<string, string[]>();
for (const f of fs.readdirSync(defsDir).sort()) {
    if (!f.endsWith('.ts')) continue;
    const lines = fs.readFileSync(path.join(defsDir, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
        const re = /name\s*=\s*['"`]([a-z][a-z0-9_]{2,})['"`]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(ln)) !== null) {
            const list = eqNames.get(m[1]) || [];
            list.push(`${f}:${i + 1}`);
            eqNames.set(m[1], list);
        }
    });
}
const nonVocabSet = new Set(censusNonVocab.map((x) => x.name));
const nonVocabDefHits: Array<{ name: string; defSites: string[] }> = [];
for (const [nm, loc] of eqNames) {
    if (nonVocabSet.has(nm)) nonVocabDefHits.push({ name: nm, defSites: loc });
}

console.log(JSON.stringify({
    probe: 'wiring-146-recall-diagnostic',
    registeredTools: registeredSet.size,
    vocabSize: vocab.size,
    censusNames: censusNames.size,
    distinctTokens: tokenLines.size,
    recallGapCount: gaps.length,
    recallGaps: gaps,
    equalsStyleDefNames: eqNames.size,
    nonVocabDefHits,
    nonVocabDefHitCount: nonVocabDefHits.length,
}, null, 2));
process.exit(0);
