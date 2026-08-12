/**
 * «ما زلت لم ارى شاشة الثيرمال يفتح مثل شاشة المتصفح ويجري اختبارات امامي …
 *  ويرى جو نتائج الاختبارات التي يجريها الثيرمال مثل ما ياخذ نتائج الجودة
 *  التي يجريها المتصفح بشكل حقيقي»
 *
 * He named a real asymmetry. The browser half opens its own panel, presses
 * every control in front of him, and returns a SCORE with named findings that
 * Joe repairs against and reports. The terminal half was a PIPE: output
 * scrolled past, the panel never opened, nothing there was ever measured.
 *
 * This proves the terminal's instrument on a REAL project with a REAL server:
 * real processes, real exit codes, and a score that moves when the system is
 * actually broken — because a check that cannot fail proves nothing.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_the_terminal_tests_too.ts
 */
export { };
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { AddressInfo } from 'net';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const TABLES = ['animals', 'vaccinations', 'doctors'];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-term-qa-'));

/** A server directory shaped exactly like the one api_project writes. */
function writeServer(dir: string, broken: { badSyntax?: boolean; openWrites?: boolean; missingTable?: boolean } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name: 'dar-al-rifq-api', private: true, version: '0.1.0', type: 'module',
        scripts: { start: 'node server.js' },
    }, null, 2));
    // node_modules with nothing declared: `npm ls --depth=0` is then honest.
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'db.js'), broken.badSyntax
        ? 'export const db = { ;;; }\n'
        : 'export const db = { backend: "json" };\n');
    fs.writeFileSync(path.join(dir, 'server.js'), '// the real server is started by the harness below\n');
}

/** The running system: health, every table, and a protected write. */
async function startSystem(tables: string[], opts: { openWrites?: boolean; hideTable?: string } = {}) {
    const srv = http.createServer((req, res) => {
        const url = String(req.url || '').split('?')[0];
        res.setHeader('content-type', 'application/json');
        if (url === '/api/health') {
            const t: Record<string, number> = {};
            for (const k of tables) t[k] = 0;
            return res.end(JSON.stringify({ ok: true, backend: 'sqlite', resource: 'bookings', tables: t }));
        }
        const m = url.match(/^\/api\/([a-z_]+)$/);
        if (m) {
            const key = m[1];
            if (key === opts.hideTable) { res.statusCode = 404; return res.end('{"ok":false}'); }
            if (req.method === 'POST') {
                // The whole point of the check: an anonymous write must be 401.
                res.statusCode = opts.openWrites ? 201 : 401;
                return res.end(JSON.stringify({ ok: !!opts.openWrites }));
            }
            return res.end(JSON.stringify({ ok: true, [key]: [] }));
        }
        res.statusCode = 404;
        res.end('{"ok":false}');
    });
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
    return { srv, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/` };
}

async function main() {
    const { auditInTerminal, failingIds } = require('../../core/quality/terminal-audit');

    console.log('\n[1] A healthy system: every check is a real process, and it passes\n');

    const goodDir = path.join(root, 'good');
    writeServer(goodDir);
    const good = await startSystem(TABLES);
    const lines: string[] = [];
    const a = await auditInTerminal(goodDir, {
        onLine: (l: string) => lines.push(l), serveUrl: good.url, tables: TABLES, timeoutMs: 20_000,
    });
    for (const l of lines) console.log(`      ${l}`);

    check('it ran real checks and scored them', a.total >= 4, `total=${a.total}`);
    check('a healthy system scores 100', a.score === 100, `${a.score}/100 — ${failingIds(a).join(', ')}`);
    check('every check printed the command it actually ran',
        a.checks.every((c: any) => !!c.command) && lines.some(l => l.startsWith('$ ')),
        lines.filter(l => l.startsWith('$ ')).join(' | ').slice(0, 160));
    check('the server was really asked over HTTP',
        a.checks.some((c: any) => c.id === 'health_answers' && c.ok));
    check('every declared table was asked for by name',
        a.checks.some((c: any) => c.id === 'tables_answer' && c.ok));
    check('and the protection of writes was actually exercised',
        a.checks.some((c: any) => c.id === 'writes_protected' && c.ok));
    good.srv.close();

    console.log('\n[2] A check that cannot fail proves nothing — so break the system\n');

    // 2a — a table that answers 404
    const halfDir = path.join(root, 'half');
    writeServer(halfDir);
    const half = await startSystem(TABLES, { hideTable: 'doctors' });
    const b = await auditInTerminal(halfDir, { serveUrl: half.url, tables: TABLES, timeoutMs: 20_000 });
    console.log(`      score=${b.score} failing=${failingIds(b).join(', ') || '(none)'}`);
    check('a table whose route 404s is caught, by name',
        failingIds(b).includes('tables_answer'), failingIds(b).join(', '));
    check('…and it names WHICH table', /doctors/.test(
        (b.checks.find((c: any) => c.id === 'tables_answer') || {}).detail || ''),
    (b.checks.find((c: any) => c.id === 'tables_answer') || {}).detail);
    half.srv.close();

    // 2b — a server that lets anyone write
    const openDir = path.join(root, 'open');
    writeServer(openDir);
    const open = await startSystem(TABLES, { openWrites: true });
    const c = await auditInTerminal(openDir, { serveUrl: open.url, tables: TABLES, timeoutMs: 20_000 });
    console.log(`      score=${c.score} failing=${failingIds(c).join(', ') || '(none)'}`);
    check('a server that accepts an anonymous write is caught',
        failingIds(c).includes('writes_protected'), failingIds(c).join(', '));
    check('and the score really drops', c.score < 100, `${c.score}/100`);
    open.srv.close();

    // 2c — a source file that does not parse
    const brokenDir = path.join(root, 'broken');
    writeServer(brokenDir, { badSyntax: true });
    const d = await auditInTerminal(brokenDir, { tables: TABLES, timeoutMs: 20_000 });
    console.log(`      score=${d.score} failing=${failingIds(d).join(', ') || '(none)'}`);
    check('a server file that does not parse is caught by node --check',
        failingIds(d).includes('sources_parse'), failingIds(d).join(', '));
    check('…and the failing FILE is named', /db\.js/.test(
        (d.checks.find((x: any) => x.id === 'sources_parse') || {}).detail || ''),
    (d.checks.find((x: any) => x.id === 'sources_parse') || {}).detail);

    console.log('\n[2d] The two failures HIS machine produced — both inside the test\n');

    /**
     * From his first real run, both of these were defects in the harness, not
     * in his system, and that is the worst kind:
     *
     *   ❌ health_answers — health answered with something that is not JSON
     *      …printed directly under the valid JSON it had just answered. The
     *      script truncated the body to 300 chars and the parent parsed the cut.
     *
     *   ❌ tables_answer — ->flags & UV_HANDLE_CLOSING), src\win\async.c:94
     *      …printed directly under «OK». process.exit() tore the loop down
     *      while undici still held sockets, libuv asserted, exit code ≠ 0.
     */
    const longDir = path.join(root, 'long');
    writeServer(longDir);
    // A health body far past 300 characters — the exact shape that broke it.
    const fat = http.createServer((q, s2) => {
        const url = String(q.url || '').split('?')[0];
        s2.setHeader('content-type', 'application/json');
        if (url === '/api/health') {
            const t: Record<string, number> = {};
            for (const k of TABLES) t[k] = 0;
            return s2.end(JSON.stringify({
                ok: true, backend: 'sqlite', count: 0, orders: 0, joe: 'api_project',
                resource: 'bookings', providers: 0,
                relation: {
                    resource: 'providers', key: 'provider_id', labelKey: 'name',
                    columns: [
                        { key: 'name', type: 'TEXT', required: true },
                        { key: 'specialty', type: 'TEXT', required: false },
                        { key: 'phone', type: 'TEXT', required: false },
                    ],
                },
                tables: t,
            }));
        }
        const m = url.match(/^\/api\/([a-z_]+)$/);
        if (m) {
            if (q.method === 'POST') { s2.statusCode = 401; return s2.end('{"ok":false}'); }
            return s2.end(JSON.stringify({ ok: true, [m[1]]: [] }));
        }
        s2.statusCode = 404; s2.end('{"ok":false}');
    });
    await new Promise<void>(r => fat.listen(0, '127.0.0.1', r));
    const fatUrl = `http://127.0.0.1:${(fat.address() as AddressInfo).port}/`;
    const f = await auditInTerminal(longDir, { serveUrl: fatUrl, tables: TABLES, timeoutMs: 20_000 });
    const health = f.checks.find((x: any) => x.id === 'health_answers');
    const tables = f.checks.find((x: any) => x.id === 'tables_answer');
    console.log(`      health: ${health?.ok ? '✅' : '❌'} ${health?.detail}`);
    console.log(`      tables: ${tables?.ok ? '✅' : '❌'} ${tables?.detail}`);
    check('a health body longer than 300 chars is no longer «not JSON»', !!health?.ok, health?.detail);
    check('…and it reads the real numbers out of it', /table\(s\) reported/.test(health?.detail || ''), health?.detail);
    check('a passing table sweep is not failed by its own teardown', !!tables?.ok, tables?.detail);
    check('and the whole run scores 100 on a healthy system', f.score === 100, `${f.score}/100 — ${failingIds(f).join(', ')}`);
    fat.close();

    console.log('\n[3] Nothing measurable is not a zero — it is «nothing was measured»\n');

    const emptyDir = path.join(root, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const e = await auditInTerminal(emptyDir, { timeoutMs: 5000 });
    check('a folder that is not a project is skipped honestly, not scored 0',
        e.skipped === 'no_project' && e.checks.length === 0, JSON.stringify(e).slice(0, 160));

    console.log('\n[4] The panel opens itself, and the build reads the result\n');

    const REACT = fs.readFileSync(
        path.join(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
    check('the build asks for the TERMINAL panel by name, as it does for the browser',
        /panel_focus[\s\S]{0,120}panel: 'terminal'/.test(REACT));
    check('it runs the terminal audit against the server directory',
        /auditInTerminal\(apiDir, \{/.test(REACT));
    check('it hands over the running system and the declared tables',
        /serveUrl: liveServer \? liveServer\.url : ''/.test(REACT) && /tables: systemTables/.test(REACT));
    check('Joe SAYS the number, the way he says the browser\'s',
        /terminal-QA: \$\{terminalAudit\.score\}\/100/.test(REACT));
    check('and it reaches the delivery message beside the browser score',
        /Terminal QA: \*\*\$\{terminalAudit\.score\}\/100\*\*/.test(REACT));
    // The panel was asked for — and eight seconds later preview_ready pulled
    // the workspace to the Preview tab, so the checks ran unwatched.
    check('the terminal runs BEFORE the live system is handed to the preview panel',
        REACT.indexOf('auditInTerminal(apiDir, {') < REACT.indexOf('self-QA: the system stays UP at'),
        'preview_ready still steals the tab mid-run');
    // …in the CODE, not in the comment that explains why it is gone.
    const TQA = fs.readFileSync(
        path.join(__dirname, '..', '..', 'core', 'quality', 'terminal-audit.ts'), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    check('…and no process.exit inside the probe scripts, which crashed libuv on Windows',
        !/process\.exit\(/.test(TQA) && /process\.exitCode/.test(TQA));

    console.log('\n[5] A repair that measured WORSE is taken back, not just un-reported\n');

    check('the repair cycle now returns the snapshot it took first',
        /snapshotId\?: string;/.test(fs.readFileSync(
            path.join(__dirname, '..', '..', 'core', 'quality', 'self-repair.ts'), 'utf-8')));
    check('and the builder restores it and rebuilds when the second measurement is lower',
        /restoreVersion\(proj, cycle\.snapshotId\)/.test(REACT) && /rolledBack && packaged\) packageIntoApi\(false\)/.test(REACT));
    check('…and says so, instead of quietly keeping the better number',
        /the repair measured WORSE — rolled the project back and rebuilt it/.test(REACT));

    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* windows holds files */ }
    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
