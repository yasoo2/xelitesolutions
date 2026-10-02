// WIRING-140: per-definition-file tool yield at Muse HEAD.
// Live registry import (expects 163 tools) + static quoted-literal attribution
// across api/src/modules/tools/definitions/*.ts (expects 93 files).
// Read-only: no network, no writes, no registry mutation.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const defDir = join(here, '..', '..', 'api', 'src', 'modules', 'tools', 'definitions');
const defFiles = readdirSync(defDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort();
const sources = new Map<string, string>();
for (const f of defFiles) sources.set(f, readFileSync(join(defDir, f), 'utf8'));

const { tools } = await import('../../api/src/modules/tools/registry.ts');
const names = (tools as any[]).map(t => t?.name).filter((n: any) => typeof n === 'string');

function quotedHits(src: string, name: string): number[] {
    // Line numbers where 'name' or "name" appears as a quoted literal.
    const lines = src.split('\n');
    const out: number[] = [];
    const sq = `'${name}'`;
    const dq = `"${name}"`;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(sq) || lines[i].includes(dq)) out.push(i + 1);
    }
    return out;
}

const perFileYield: Record<string, number> = {};
const yieldNames: Record<string, string[]> = {};
for (const f of defFiles) { perFileYield[f] = 0; yieldNames[f] = []; }
const unattributed: string[] = [];
const multi: { name: string; files: string[] }[] = [];
for (const n of names) {
    const hits: string[] = [];
    for (const [f, src] of sources) {
        if (quotedHits(src, n).length > 0) hits.push(f);
    }
    if (hits.length === 0) unattributed.push(n);
    else {
        for (const f of hits) { perFileYield[f]++; yieldNames[f].push(n); }
        if (hits.length > 1) multi.push({ name: n, files: hits });
    }
}

function fileExports(src: string): string[] {
    const out: string[] = [];
    const re = /export\s+(?:default\s+)?(?:class|const|function|abstract\s+class)\s+([A-Za-z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
    return out.slice(0, 12);
}

const zeroYield = defFiles
    .filter(f => perFileYield[f] === 0)
    .map(f => ({ file: f, exports: fileExports(sources.get(f)!), bytes: sources.get(f)!.length }));

// Bounded excerpts for multi-file names (first hit line each, trimmed to 160 chars).
const multiExcerpts: { name: string; hits: { file: string; line: number; text: string }[] }[] = [];
for (const m of multi.slice(0, 40)) {
    const hits: { file: string; line: number; text: string }[] = [];
    for (const f of m.files.slice(0, 4)) {
        const src = sources.get(f)!;
        const ln = quotedHits(src, m.name)[0];
        const text = src.split('\n')[ln - 1].trim().slice(0, 160);
        hits.push({ file: f, line: ln, text });
    }
    multiExcerpts.push({ name: m.name, hits });
}

console.log(JSON.stringify({
    registeredTools: names.length,
    uniqueNames: new Set(names).size,
    filesScanned: defFiles.length,
    zeroYieldCount: zeroYield.length,
    zeroYield,
    unattributedCount: unattributed.length,
    unattributed,
    multiFileCount: multi.length,
    multi: multi.map(m => ({ name: m.name, files: m.files })),
    multiExcerpts,
    perFileYield,
}, null, 2));
