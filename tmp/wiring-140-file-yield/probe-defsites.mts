// WIRING-140b: definition-site count per registered name at Muse HEAD.
// For each live-registered name, count `name = 'N'` / `name: 'N'` definition
// patterns across all definition files. Expect exactly 1 each (registry
// import already throws on duplicate registration; this checks the source).
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

const zero: string[] = [];
const multi: { name: string; sites: { file: string; line: number }[] }[] = [];
for (const n of names) {
    const sites: { file: string; line: number }[] = [];
    for (const [f, src] of sources) {
        for (const ln of defSites(src, n)) sites.push({ file: f, line: ln });
    }
    if (sites.length === 0) zero.push(n);
    else if (sites.length > 1) multi.push({ name: n, sites });
}

console.log(JSON.stringify({
    registeredTools: names.length,
    exactlyOne: names.length - zero.length - multi.length,
    zeroDefSites: zero,
    multiDefSites: multi,
}, null, 2));
