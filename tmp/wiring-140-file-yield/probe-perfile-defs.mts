// WIRING-140d: per-file definition counts (live registered set + def-site map).
// Same def-site method as 140b, aggregated by defining file.
// Read-only: no network, no writes.
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

function defSites(src: string, name: string): number[] {
    const lines = src.split('\n');
    const out: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i];
        if (t.includes(`name = '${name}'`) || t.includes(`name = "${name}"`) ||
            t.includes(`name: '${name}'`) || t.includes(`name: "${name}"`)) out.push(i + 1);
    }
    return out;
}

const perFileDefs: Record<string, string[]> = {};
for (const f of defFiles) perFileDefs[f] = [];
let mapped = 0;
for (const n of names) {
    for (const [f, src] of sources) {
        if (defSites(src, n).length > 0) { perFileDefs[f].push(n); mapped++; }
    }
}
const counts: Record<string, number> = {};
for (const f of defFiles) counts[f] = perFileDefs[f].length;
const zeroDefFiles = defFiles.filter(f => counts[f] === 0);
const top = [...defFiles].sort((a, b) => counts[b] - counts[a]).slice(0, 8)
    .map(f => ({ file: f, defs: counts[f] }));

console.log(JSON.stringify({
    registeredTools: names.length,
    mappedDefSites: mapped,
    definingFiles: defFiles.length - zeroDefFiles.length,
    zeroDefFiles,
    topDefiningFiles: top,
    perFileDefCounts: counts,
}, null, 2));
