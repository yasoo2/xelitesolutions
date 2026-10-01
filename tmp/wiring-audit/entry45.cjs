// MUSE WIRING DISCOVERY 045 — baseTools-membership leg for ENTRY-B 20 + live /api/tools cross-check.
// Static text scan, zero Joe imports (both trees). Runtime leg: one unauthenticated
// GET /api/tools against the run30 own-API window (read-only, no execution).
const fs = require('fs');
const path = require('path');
const http = require('http');

const MUSE = 'D:/Joe/muse-worktree';
const MAIN = 'D:/Joe/xelitesolutions';
const OUT = path.join(MUSE, 'tmp', 'wiring-audit', 'fx-entry45');
fs.mkdirSync(OUT, { recursive: true });

const ENTRYB_MUSE = ['ai_write_file', 'api_project', 'create_file', 'engineering_discovery', 'file_write', 'inspect_directory', 'npm_manager', 'project_edit', 'project_pipeline', 'project_planner', 'project_repair', 'project_run', 'react_project', 'read_file', 'scaffold_full_stack', 'scaffold_project', 'shell_execute', 'web_page_builder', 'write_file', 'write_to_file'];
const ENTRYB_MAIN_EXTRA = ['specification_verification'];

// v2: class-chunk mapping (first `name = 'snake_case'` ASSIGNMENT per class;
// object-literal `name:` excluded), createTool()+new extraction, one-level
// extends-inheritance for transitive-subclass shapes.
function classNameMap(tree) {
    const dir = path.join(tree, 'api', 'src', 'modules', 'tools', 'definitions');
    const own = {}, ext = {};
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.ts')) continue;
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        const chunks = src.split(/(?=export\s+(?:default\s+)?class\s+\w+)/g);
        for (const ch of chunks) {
            const cm = ch.match(/export\s+(?:default\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/);
            if (!cm) continue;
            const nm = ch.match(/name\s*=\s*['"]([a-z][a-z0-9_]{1,})['"]/);
            if (nm) own[cm[1]] = nm[1];
            if (cm[2]) ext[cm[1]] = cm[2];
        }
    }
    const map = {};
    for (const c of Object.keys(ext)) {
        if (!own[c] && own[ext[c]]) map[c] = own[ext[c]] + ' (via extends ' + ext[c] + ')';
    }
    for (const c of Object.keys(own)) map[c] = own[c];
    return map;
}

// v4: + namespaced new NS.Member(), + bare const-object refs, + ...Spread arrays.
function constNameMap(tree) {
    const dir = path.join(tree, 'api', 'src', 'modules', 'tools', 'definitions');
    const map = {};
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.ts')) continue;
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        const chunks = src.split(/(?=export\s+const\s+\w+)/g);
        for (const ch of chunks) {
            const cm = ch.match(/export\s+const\s+(\w+)/);
            if (!cm || /ToolDefinition\[\]/.test(ch.slice(0, 120))) continue; // arrays handled separately
            const nm = ch.match(/name\s*:\s*['"]([a-z][a-z0-9_]{1,})['"]/);
            if (nm) map[cm[1]] = nm[1];
        }
    }
    return map;
}

function spreadMembers(tree, regSrc, spreadName) {
    const im = regSrc.match(new RegExp(`import\\s*\\{[^}]*\\b${spreadName}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`));
    if (!im) return [];
    const modPath = path.join(tree, 'api', 'src', 'modules', 'tools', im[1] + '.ts');
    if (!fs.existsSync(modPath)) return [];
    const src = fs.readFileSync(modPath, 'utf8');
    const ex = src.indexOf('export const ' + spreadName);
    if (ex < 0) return [];
    const arr = src.indexOf('[', src.indexOf('=', ex));
    let depth = 0, end = -1;
    for (let i = arr; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return [];
    return [...src.slice(arr, end).matchAll(/name\s*:\s*['"]([a-z][a-z0-9_]{1,})['"]/g)].map((m) => m[1]);
}

function selectedNames(tree) {
    const reg = fs.readFileSync(path.join(tree, 'api', 'src', 'modules', 'tools', 'registry.ts'), 'utf8');
    const start = reg.indexOf('const revivedTools');
    const end = reg.indexOf('export const tools');
    const revSpan = reg.slice(start, reg.indexOf('const baseTools'));
    const baseSpan = reg.slice(reg.indexOf('const baseTools'), end);
    const cmap = classNameMap(tree);
    const omap = constNameMap(tree);
    const sel = { revived: [], base: [], unmapped: [] };
    const grab = (span, bucket) => {
        for (const m of span.matchAll(/new\s+(\w+)(?:\.(\w+))?\s*\(/g)) {
            const c = m[2] || m[1];
            if (c === 'T') continue;
            (cmap[c] ? sel[bucket] : sel.unmapped).push(cmap[c] ? { class: (m[2] ? m[1] + '.' : '') + c, name: cmap[c] } : c);
        }
        for (const m of span.matchAll(/createTool\((\w+)\)/g)) {
            const c = m[1];
            (cmap[c] ? sel[bucket] : sel.unmapped).push(cmap[c] ? { class: c, name: cmap[c] } : c);
        }
        for (const m of span.matchAll(/^\s*(\w+Tool),?\s*(?:\/\/|$)/gm)) {
            const c = m[1];
            if (new RegExp(`\\b(new|createTool|safeNew|import)\\b[^\\n]*${c}`).test(span)) continue;
            const nm = omap[c] || cmap[c];
            (nm ? sel[bucket] : sel.unmapped).push(nm ? { class: c, name: nm } : c);
        }
        for (const m of span.matchAll(/\.\.\.(\w+)/g)) {
            if (m[1] === 'revivedTools') continue;
            for (const n of spreadMembers(tree, reg, m[1])) sel[bucket].push({ class: '...' + m[1], name: n });
        }
    };
    grab(revSpan, 'revived');
    grab(baseSpan, 'base');
    const selected = sel.revived.concat(sel.base);
    return { revivedCount: sel.revived.length, baseCount: sel.base.length, selected, unmapped: [...new Set(sel.unmapped)] };
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}

async function main() {
    const out = {};
    for (const [label, tree, entryb] of [['MUSE', MUSE, ENTRYB_MUSE], ['MAIN', MAIN, ENTRYB_MUSE.concat(ENTRYB_MAIN_EXTRA)]]) {
        const sel = selectedNames(tree);
        const names = new Set(sel.selected.map((s) => s.name));
        out[label] = {
            revivedSelected: sel.revivedCount,
            baseSelected: sel.baseCount,
            selectedUnique: names.size,
            unmappedClasses: sel.unmapped,
            entryb: entryb.map((n) => ({ name: n, selected: names.has(n) })),
            selectedNames: [...names].sort(),
            selectedPairs: sel.selected,
        };
        fs.writeFileSync(path.join(OUT, `entry45_${label}.json`), JSON.stringify(out[label], null, 1));
    }
    // Runtime leg (Muse live own-API only).
    const live = await getJson('http://127.0.0.1:5101/api/tools');
    const liveNames = new Set((live.tools || []).map((t) => t.name));
    out.RUNTIME_MUSE_5101 = {
        count: live.count, namesReceived: liveNames.size,
        entryb: ENTRYB_MUSE.map((n) => ({ name: n, registered: liveNames.has(n) })),
    };
    fs.writeFileSync(path.join(OUT, 'entry45_RUNTIME.json'), JSON.stringify({
        count: live.count, names: [...liveNames].sort(),
        entryb: out.RUNTIME_MUSE_5101.entryb,
    }, null, 1));
    console.log(JSON.stringify({
        MUSE: { rev: out.MUSE.revivedSelected, base: out.MUSE.baseSelected, uniq: out.MUSE.selectedUnique, unmapped: out.MUSE.unmappedClasses, entrybMissing: out.MUSE.entryb.filter((e) => !e.selected).map((e) => e.name) },
        MAIN: { rev: out.MAIN.revivedSelected, base: out.MAIN.baseSelected, uniq: out.MAIN.selectedUnique, unmapped: out.MAIN.unmappedClasses, entrybMissing: out.MAIN.entryb.filter((e) => !e.selected).map((e) => e.name) },
        RUNTIME: { count: live.count, received: liveNames.size, entrybMissing: out.RUNTIME_MUSE_5101.entryb.filter((e) => !e.registered).map((e) => e.name) },
    }, null, 1));
}
main().catch((e) => { console.error('ENTRY45_FAIL', e.message); process.exit(1); });
