// WIRING-144: executor tool-name reference census.
// Live-grounded: registry + resolvePlannedTool + TOOL_ALIASES are imported
// live (same as 143); PhaseExecutorTool.ts is READ as text (never imported,
// never executed) and every tool-vocabulary name it references is classified
// live. ZERO DISPATCH: no executeTool, no firewall context, no network, no
// filesystem writes, no registry mutation. Deterministic stdout (canonical
// JSON, sorted); volatile timings go to stderr only.
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

const TOOL_ALIASES: Record<string, string> = svc.TOOL_ALIASES || {};
const aliasKeys = new Set(Object.keys(TOOL_ALIASES));
const aliasTargets = new Set(Object.values(TOOL_ALIASES).map(String));

const catalogue: Array<{ tool: string; purpose: string }> = Array.isArray(pt.PLANNER_TOOL_CATALOGUE)
    ? pt.PLANNER_TOOL_CATALOGUE
    : [];
const catalogueSet = new Set(catalogue.map((c: any) => String(c?.tool || '')));

// Declared names: `name: 'xxx'` across the tool definition directory.
const defsDir = path.resolve(here, '../../api/src/modules/tools/definitions');
const declaredIn = new Map<string, string[]>(); // name -> ["File.ts:line", ...]
for (const f of fs.readdirSync(defsDir).sort()) {
    if (!f.endsWith('.ts')) continue;
    const lines = fs.readFileSync(path.join(defsDir, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
        const re = /name\s*:\s*['"]([a-z][a-z0-9_]{2,})['"]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(ln)) !== null) {
            const list = declaredIn.get(m[1]) || [];
            list.push(`${f}:${i + 1}`);
            declaredIn.set(m[1], list);
        }
    });
}

const vocab = new Set<string>([
    ...registeredSet,
    ...aliasKeys,
    ...aliasTargets,
    ...catalogueSet,
    ...declaredIn.keys(),
]);

// Executor source: quoted literals + regex-literal tokens.
const execPath = path.join(defsDir, 'PhaseExecutorTool.ts');
const execText = fs.readFileSync(execPath, 'utf8');
const execLines = execText.split('\n');
const execSha256 = crypto.createHash('sha256').update(execText).digest('hex');

const TOOL_SHAPE = /^[a-z][a-z0-9_]{2,}$/;
type Ref = { lines: number[]; regexLines: number[]; regexSrc: string[] };
const refs = new Map<string, Ref>();
const bump = (nm: string, line: number, rx: string | null) => {
    let r = refs.get(nm);
    if (!r) { r = { lines: [], regexLines: [], regexSrc: [] }; refs.set(nm, r); }
    if (rx === null) { if (!r.lines.includes(line)) r.lines.push(line); }
    else {
        if (!r.regexLines.includes(line)) r.regexLines.push(line);
        if (r.regexSrc.length < 3 && !r.regexSrc.includes(rx)) r.regexSrc.push(rx.slice(0, 120));
    }
};

execLines.forEach((ln, i) => {
    const lineNo = i + 1;
    // Quoted literals (single/double; backticks only when template-free).
    const qre = /(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;
    let qm: RegExpExecArray | null;
    while ((qm = qre.exec(ln)) !== null) {
        const body = qm[2];
        if (qm[1] === '`' && body.includes('${')) continue;
        if (TOOL_SHAPE.test(body)) bump(body, lineNo, null);
    }
    // Regex literals: /.../flags — tokenize pattern bodies, keep vocab hits only.
    const rxre = /\/(?![/*])(?:[^/\\\n]|\\.)+\/[dgimsuvy]*/g;
    let rm: RegExpExecArray | null;
    while ((rm = rxre.exec(ln)) !== null) {
        const body = rm[0].replace(/^\/|\/[dgimsuvy]*$/g, '');
        for (const tok of body.split(/[^a-z0-9_]+/)) {
            if (tok.length >= 3 && TOOL_SHAPE.test(tok) && vocab.has(tok)) bump(tok, lineNo, rm[0]);
        }
    }
});

type Row = {
    name: string; quotedLines: number[]; regexLines: number[]; regexSrc: string[];
    registered: boolean; aliasKey: boolean; aliasTargetOf: string[];
    declaredIn: string[]; inCatalogue: boolean;
    resolvedTool: string | null; resolveHow: string | null; verdict: string;
};
const rows: Row[] = [];
const nonVocabUnderscore: Array<{ name: string; lines: number[] }> = [];
const nonVocabPlain: Array<{ name: string; lines: number[] }> = [];
for (const [nm, r] of [...refs.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (!vocab.has(nm)) {
        if (nm.includes('_')) nonVocabUnderscore.push({ name: nm, lines: r.lines });
        else nonVocabPlain.push({ name: nm, lines: r.lines });
        continue;
    }
    const res: any = pt.resolvePlannedTool(nm);
    const registered = registeredSet.has(nm);
    const aliasKey = aliasKeys.has(nm);
    const aliasTargetOf = Object.keys(TOOL_ALIASES).filter((k) => TOOL_ALIASES[k] === nm).sort();
    const declared = declaredIn.get(nm) || [];
    let verdict = 'UNCLASSIFIED';
    if (registered && res?.tool === nm && res?.how === 'exact') verdict = 'REGISTERED_EXACT';
    else if (aliasKey) verdict = 'ALIAS_KEY';
    else if (registered) verdict = 'REGISTERED_NONEXACT';
    else if (declared.length > 0) verdict = 'DANGLING_DECLARED';
    else verdict = 'DANGLING_UNDECLARED';
    rows.push({
        name: nm, quotedLines: r.lines, regexLines: r.regexLines, regexSrc: r.regexSrc,
        registered, aliasKey, aliasTargetOf,
        declaredIn: declared, inCatalogue: catalogueSet.has(nm),
        resolvedTool: res?.tool ?? null, resolveHow: res?.how ?? null, verdict,
    });
}

const byVerdict = (v: string) => rows.filter((r) => r.verdict === v).map((r) => r.name);

console.log(JSON.stringify({
    probe: 'wiring-144-executor-ref-census',
    executorFile: 'api/src/modules/tools/definitions/PhaseExecutorTool.ts',
    executorBytes: execText.length,
    executorLines: execLines.length,
    executorSha256: execSha256,
    registeredTools: registeredNames.length,
    vocabSize: vocab.size,
    declaredNameCount: declaredIn.size,
    referencedVocabCount: rows.length,
    verdictCounts: {
        REGISTERED_EXACT: byVerdict('REGISTERED_EXACT').length,
        REGISTERED_NONEXACT: byVerdict('REGISTERED_NONEXACT').length,
        ALIAS_KEY: byVerdict('ALIAS_KEY').length,
        DANGLING_DECLARED: byVerdict('DANGLING_DECLARED').length,
        DANGLING_UNDECLARED: byVerdict('DANGLING_UNDECLARED').length,
    },
    danglingDeclared: rows.filter((r) => r.verdict === 'DANGLING_DECLARED'),
    danglingUndeclared: rows.filter((r) => r.verdict === 'DANGLING_UNDECLARED'),
    aliasKeysReferenced: rows.filter((r) => r.verdict === 'ALIAS_KEY'),
    registeredNonExact: rows.filter((r) => r.verdict === 'REGISTERED_NONEXACT'),
    registeredExactNames: byVerdict('REGISTERED_EXACT'),
    nonVocabUnderscoreLiterals: nonVocabUnderscore,
    nonVocabUnderscoreCount: nonVocabUnderscore.length,
    nonVocabPlainLiterals: nonVocabPlain,
    nonVocabPlainLiteralCount: nonVocabPlain.length,
    rows,
}, null, 2));
process.exit(0);
