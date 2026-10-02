// WIRING-140c: static declared-name census (plain node, no TS import).
// Extracts `name = 'N'` / `name: 'N'` literals per definition file.
// Expect: total declared == 167 (163 registered + 4 unregistered).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const defDir = join(here, '..', '..', 'api', 'src', 'modules', 'tools', 'definitions');
const defFiles = readdirSync(defDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort();

const perFile = {};
let total = 0;
const seen = new Map(); // name -> [files]
for (const f of defFiles) {
    const src = readFileSync(join(defDir, f), 'utf8');
    const names = [];
    const re = /\bname\s*[:=]\s*['"]([A-Za-z0-9_]+)['"]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        // Exclude obvious non-tool-name hits: planner `tool:` is different key; `fileName`/`toolName`
        // don't match \bname. Keep all `name` hits; triage via total.
        names.push(m[1]);
        if (!seen.has(m[1])) seen.set(m[1], []);
        seen.get(m[1]).push(f);
    }
    perFile[f] = names;
    total += names.length;
}
const dupDeclared = [...seen.entries()].filter(([, fs]) => fs.length > 1)
    .map(([n, fs]) => ({ name: n, files: fs }));
const zeroDeclared = defFiles.filter(f => perFile[f].length === 0);
console.log(JSON.stringify({ filesScanned: defFiles.length, totalDeclared: total, uniqueDeclared: seen.size, zeroDeclared, dupDeclared }, null, 2));
