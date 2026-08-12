/**
 * «ما هذا الذي فتحه جو؟؟؟»
 *
 *     > dar-al-rifq@0.1.0 dev
 *     > vite
 *     Port 5173 is in use, trying another one...
 *     ➜  Local:   http://localhost:5174/
 *
 * Five lines, four defects:
 *
 *   • it opened a DEV SERVER over the source folder — the hot-reload tool a
 *     programmer uses — when the finished system was the API server next to
 *     it, with the built interface already packaged into its public/;
 *   • so nothing was behind it: no database, no sign-in, no tables;
 *   • Joe announced «على المنفذ 4300» while Vite, which does not read PORT,
 *     went to its own default;
 *   • that default was occupied by a Vite from an EARLIER run nobody stopped,
 *     so it drifted again — and the address Joe handed him, 4300, was dead.
 *
 * This runs the real tool against real folders on real ports.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_the_run_opens_the_system.ts
 */
export { };
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-run-proof-'));
const reactDir = path.join(root, 'dar-al-rifq');
const apiDir = path.join(root, 'dar-al-rifq-api');

/** The React SOURCE folder, exactly as the builder writes it: dev/build/preview. */
function writeReactSource() {
    fs.mkdirSync(path.join(reactDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(reactDir, 'package.json'), JSON.stringify({
        name: 'dar-al-rifq', private: true, version: '0.1.0', type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1' },
        devDependencies: { vite: '^5.4.11' },
    }, null, 2));
    fs.writeFileSync(path.join(reactDir, 'vite.config.js'), 'export default {};\n');
    fs.writeFileSync(path.join(reactDir, 'index.html'), '<!doctype html><title>src</title>');
}

/** The API server the interface was packaged INTO — the real system. */
function writeApiWithPackagedUi() {
    fs.mkdirSync(path.join(apiDir, 'public'), { recursive: true });
    fs.writeFileSync(path.join(apiDir, 'package.json'), JSON.stringify({
        name: 'dar-al-rifq-api', private: true, version: '0.1.0',
        scripts: { start: 'node server.js' },
    }, null, 2));
    fs.writeFileSync(path.join(apiDir, 'public', 'index.html'),
        '<!doctype html><title>Dar Al-Rifq</title><h1>the whole system</h1>');
    fs.writeFileSync(path.join(apiDir, 'server.js'), `
const http = require('http');
const fs = require('fs');
const path = require('path');
const port = Number(process.env.PORT) || 3000;
http.createServer((req, res) => {
    if (req.url === '/api/health') { res.writeHead(200, {'content-type':'application/json'}); return res.end('{"ok":true}'); }
    const f = path.join(__dirname, 'public', 'index.html');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(f));
}).listen(port, '127.0.0.1', () => console.log('listening on ' + port));
`);
}

async function main() {
    writeReactSource();
    writeApiWithPackagedUi();

    const { executeTool } = require('../../modules/services/ToolService');
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const run = (input: any, ctx: any) => executionFirewall.runInContext('run-proof', () =>
        executeTool('project_run', input, ctx));

    const sessionKey = 'runproof';
    (global as any).joeProjects = {
        [sessionKey]: {
            dir: reactDir, type: 'react', brand: 'Dar Al-Rifq',
            packagedInto: apiDir, updatedAt: Date.now(),
        },
    };
    const ctx = () => ({
        sessionId: sessionKey, userId: 'proof', workspaceId: `ws-${Date.now()}`, language: 'en',
        onProgress: (m: string) => lines.push(String(m)),
    });
    let lines: string[] = [];

    console.log('\n[1] What Joe opens is the SYSTEM, not the source folder\n');

    lines = [];
    const res = await run({}, ctx()).catch((e: any) => ({ ok: false, error: String(e?.message) }));
    for (const l of lines) console.log(`        · ${l}`);

    check('it said it is starting the packaged system, not the source',
        lines.some(l => /packaged inside the server/i.test(l)), lines.join(' | ').slice(0, 200));
    check('it did NOT run vite',
        !lines.some(l => /dev-server/.test(l)), lines.join(' | ').slice(0, 200));
    check('the server answered and a URL was returned',
        !!res?.ok && !!res?.output?.url && res.output.ready === true,
        JSON.stringify(res?.output || res?.error).slice(0, 200));

    const url = String(res?.output?.url || '');
    if (url) {
        const body = await new Promise<string>(r => {
            http.get(url, resp => { let b = ''; resp.on('data', c => { b += c; }); resp.on('end', () => r(b)); })
                .on('error', () => r(''));
        });
        check('the URL serves the PACKAGED interface', /the whole system/.test(body), body.slice(0, 120));
        const health = await new Promise<string>(r => {
            http.get(`${url.replace(/\/$/, '')}/api/health`, resp => {
                let b = ''; resp.on('data', c => { b += c; }); resp.on('end', () => r(b));
            }).on('error', () => r(''));
        });
        check('…and its API answers on the SAME origin — a real backend is behind it',
            /"ok"\s*:\s*true/.test(health), health.slice(0, 120));
    } else {
        check('the URL serves the PACKAGED interface', false, 'no url');
        check('…and its API answers on the SAME origin', false, 'no url');
    }
    const announced = Number(res?.output?.port || 0);
    check('the announced port IS the port it bound',
        announced > 0 && lines.some(l => l.includes(String(announced))),
        `port=${announced}`);

    await run({ command: 'stop' }, ctx()).catch(() => null);
    await executeTool('project_stop', {}, { sessionId: sessionKey, workspaceId: 'ws-stop' }).catch(() => null);

    console.log('\n[2] A real Vite project is told its port, and does not drift\n');

    // Occupy Vite's default, exactly as his machine was.
    const squatter = http.createServer((_q, s) => s.end('squatter'));
    await new Promise<void>(r => squatter.listen(5173, '127.0.0.1', r));
    check('port 5173 is occupied, as it was on his machine',
        (squatter.address() as AddressInfo).port === 5173);

    const { detectStart } = require('../../modules/tools/definitions/ProjectRunTool');
    // The detector is exported for this proof; if not, read the command the
    // tool would build by running it against the source folder directly.
    if (typeof detectStart === 'function') {
        const d = detectStart(reactDir, 4321);
        console.log(`        command: ${d.command}`);
        check('vite is told --port', /--port 4321/.test(d.command), d.command);
        check('…and --strictPort, so it fails instead of drifting silently',
            /--strictPort/.test(d.command), d.command);
        check('the port is marked FORCED, so readiness will not go hunting',
            d.forced === true);
    }

    // …and with a forced port, readiness must not adopt the squatter on 5173.
    (global as any).joeProjects[sessionKey].packagedInto = '';
    lines = [];
    const viteRes = await run({ cwd: reactDir, port: 4399 }, ctx())
        .catch((e: any) => ({ ok: false, error: String(e?.message) }));
    for (const l of lines) console.log(`        · ${l}`);
    check('a dev server that never came up is NOT reported as the squatter on 5173',
        Number(viteRes?.output?.port || 0) !== 5173,
        JSON.stringify(viteRes?.output || viteRes?.error).slice(0, 200));
    check('and no URL is handed over for a server that was never confirmed',
        viteRes?.output?.ready === true || !viteRes?.output?.url,
        JSON.stringify(viteRes?.output || {}).slice(0, 200));
    if (viteRes?.output?.ready !== true) {
        check('instead it says how to start it by hand',
            lines.some(l => /Run it yourself/.test(l)), lines.join(' | ').slice(0, 200));
    }

    squatter.close();
    await executeTool('project_stop', {}, { sessionId: sessionKey, workspaceId: 'ws-stop2' }).catch(() => null);
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* windows holds files */ }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
