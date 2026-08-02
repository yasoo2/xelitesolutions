/**
 * LIVE PROOF — a built SYSTEM is actually RUN, not just rendered.
 *
 * The distinction the user drew: a web PAGE previews by loading an HTML file;
 * a SYSTEM (a Node server) is a PROGRAM that must be started, stay alive on a
 * port, and answer real HTTP requests. This proof writes a real Node server to
 * disk, runs it via project_run, and hits its live endpoint over HTTP — then
 * stops it and proves the port is freed. No web page, a genuine running program.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_project_run.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

process.env.MOCK_DB = process.env.MOCK_DB || 'true';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

function get(url: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let b = ''; res.on('data', (c) => b += c);
            res.on('end', () => resolve({ status: res.statusCode || 0, body: b }));
        });
        req.on('error', reject);
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

async function main() {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), `run-proof-${Date.now()}-`));
    // A REAL Node server that reads PORT and answers a distinctive body.
    fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({
        name: 'inventory-system', version: '1.0.0', scripts: { start: 'node server.js' },
    }, null, 2));
    fs.writeFileSync(path.join(proj, 'server.js'),
        `const http=require('http');const p=process.env.PORT||3000;` +
        `http.createServer((req,res)=>{res.writeHead(200);res.end('INVENTORY_SYSTEM_LIVE');}).listen(p,()=>console.log('up on '+p));`);

    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx = { sessionId: `run-${Date.now()}`, workspaceId: `run-${Date.now()}` };
    const run = (tool: string, input: any) => executionFirewall.runAsSystem(() => executeTool(tool, input, ctx));

    // Run the system.
    const runRes: any = await run('project_run', { cwd: proj });
    const url = runRes?.output?.url;
    const port = runRes?.output?.port;

    // The PROOF a page-preview can never give: a real HTTP request to the
    // running program returns the body the server's own code produced.
    let liveBody = '';
    if (url) { try { liveBody = (await get(url)).body; } catch { /* stays empty → fails */ } }

    // Stop it, and confirm the port is actually released.
    const stopRes: any = await run('project_stop', {});
    await new Promise(r => setTimeout(r, 1500));
    let stillUp = true;
    try { await get(`http://127.0.0.1:${port}/`); } catch { stillUp = false; }

    const checks: Array<[string, boolean]> = [
        ['project_run detected a Node server and started it', runRes?.ok === true && runRes.output?.kind !== 'static'],
        ['it reported the system ready on a real port', runRes?.output?.ready === true && !!port],
        ['PROOF: a live HTTP request hit the RUNNING program', liveBody.includes('INVENTORY_SYSTEM_LIVE')],
        ['the delivery preview URL is a localhost app, not a file', /^http:\/\/localhost:\d+\//.test(String(url))],
        ['project_stop reported it stopped the server', stopRes?.ok === true && stopRes.output?.stopped === true],
        ['PROOF: after stop, the port is freed (server truly gone)', stillUp === false],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    try { fs.rmSync(proj, { recursive: true, force: true }); } catch { /* cleanup */ }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: a built system is RUN live, answers real requests, and stops cleanly.'
        : `\n${failed} CHECK(S) FAILED — run=${JSON.stringify(runRes).slice(0, 400)}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
