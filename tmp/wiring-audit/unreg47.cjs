// MUSE WIRING DISCOVERY 047 — implemented-not-registered candidate census (both trees).
// Static text scan, zero Joe imports. For every exported tool class/const in
// api/src/modules/tools/definitions, check reference in api/src/modules/tools/registry.ts.
// Run 2x; outputs must be byte-identical apart from the run tag.
const fs = require('fs');
const path = require('path');

const MUSE = 'D:/Joe/muse-worktree';
const MAIN = 'D:/Joe/xelitesolutions';
const OUT = path.join(MUSE, 'tmp', 'wiring-audit', 'fx-unreg47');
fs.mkdirSync(OUT, { recursive: true });
const runTag = process.argv[2] || 'a';

function exportedSymbols(tree) {
    const dir = path.join(tree, 'api', 'src', 'modules', 'tools', 'definitions');
    const out = [];
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.ts')) continue;
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        const chunks = src.split(/(?=export\s+(?:default\s+)?(?:class|const)\s+\w+)/g);
        for (const ch of chunks) {
            const cm = ch.match(/export\s+(?:default\s+)?(class|const)\s+(\w+)/);
            if (!cm) continue;
            if (/ToolDefinition\[\]/.test(ch.slice(0, 120))) { out.push({ sym: cm[2], kind: 'array', file: f }); continue; }
            out.push({ sym: cm[2], kind: cm[1], file: f });
        }
    }
    return out;
}

function registryRefs(tree) {
    const src = fs.readFileSync(path.join(tree, 'api', 'src', 'modules', 'tools', 'registry.ts'), 'utf8');
    return src;
}

function census(tree, label) {
    const reg = registryRefs(tree);
    const syms = exportedSymbols(tree);
    const unref = [];
    for (const s of syms) {
        // reference = import binding or member access or bare mention as word
        const re = new RegExp('\\b' + s.sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        if (!re.test(reg)) unref.push(s);
    }
    return { label, exported: syms.length, unreferenced: unref };
}

const result = {
    run: runTag,
    muse: census(MUSE, 'MUSE'),
    main: census(MAIN, 'MAIN'),
};
const fp = path.join(OUT, 'unreg47_' + runTag + '.json');
fs.writeFileSync(fp, JSON.stringify(result, null, 1));
console.log('MUSE exported=' + result.muse.exported + ' unref=' + result.muse.unreferenced.length);
console.log('MAIN exported=' + result.main.exported + ' unref=' + result.main.unreferenced.length);
console.log('wrote ' + fp);
