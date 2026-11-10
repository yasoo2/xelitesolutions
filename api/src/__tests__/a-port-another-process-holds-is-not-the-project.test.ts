/**
 * ⛔ A PORT ANOTHER PROCESS HOLDS IS NOT THE PROJECT THAT WAS JUST STARTED (ProjectRunTool).
 *
 * The fourth live check, 2026-11-10 (L162, an Arabic store): a «vite preview» of
 * another project had held 4173 for two days. project_run started the store on
 * 4300; the store was slower to bind than the first look at the common ports,
 * and 4173 answered first — «live preview: http://127.0.0.1:4173/». The coverage
 * probe asked that other project for /api/products, got its page, and refused
 * the store «products not served»; Joe rebuilt a server that worked, eleven
 * minutes. Pinned on the machine's own tables: a port's listener is this
 * launch's only when it is the launched process or descends from it.
 *
 * (netstat and .NET's listener list were tried and dropped: on his Windows they
 * show 4 listeners of dozens. The NetTCPIP table is whole, and takes ~10 s.)
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { heldByLaunched as heldRaw, processAncestry } from '../modules/tools/definitions/ProjectRunTool';

//  Joe's own calls run inside an agent's context; the gateway refuses any other (as a-preview-outlives-the-joe-that-started-it does).
const inContext = <T>(fn: () => Promise<T>) => executionFirewall.runInContext('port-owner-test', fn);
const heldByLaunched = (port: number, launched: number) => inContext(() => heldRaw(port, launched));

jest.setTimeout(240_000);

function listen(server: http.Server): Promise<number> {
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as any).port)));
}

function waitForLine(child: ReturnType<typeof spawn>): Promise<number> {
    return new Promise((resolve, reject) => {
        let out = '';
        child.stdout!.on('data', d => { out += d; const m = /PORT (\d+)/.exec(out); if (m) resolve(Number(m[1])); });
        child.on('exit', code => reject(new Error(`child exited ${code}`)));
    });
}

test('the ancestry of a process reaches the process that started it', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore', windowsHide: true });
    try {
        const chain = await inContext(() => processAncestry.read(Number(child.pid)));
        expect(chain[0]).toBe(child.pid);
        expect(chain).toContain(process.pid);
    } finally { child.kill(); }
});

test('a server this launch started holds its port; somebody else\'s does not', async () => {
    //  Somebody else's: a server in this process, while the «launched» process is an unrelated child.
    const foreign = http.createServer((_q, r) => r.end('another project'));
    const foreignPort = await listen(foreign);
    const unrelated = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore', windowsHide: true });
    //  This launch's own: a child that starts the server, as npm starts node.
    const script = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'joe-port-owner-')), 'server.js');
    fs.writeFileSync(script, "const s=require('http').createServer((q,r)=>r.end('mine'));s.listen(0,'127.0.0.1',()=>console.log('PORT '+s.address().port));setTimeout(()=>{},120000);");
    const launched = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    try {
        const ownPort = await waitForLine(launched);
        expect(await heldByLaunched(ownPort, Number(launched.pid))).toBe(true);
        //  …and from the launcher above it: npm → node, cmd → node.
        expect(await heldByLaunched(ownPort, process.pid)).toBe(true);
        expect(await heldByLaunched(foreignPort, Number(unrelated.pid))).toBe(false);
        expect(await heldByLaunched(foreignPort, Number(launched.pid))).toBe(false);
    } finally {
        launched.kill();
        unrelated.kill();
        await new Promise<void>(r => foreign.close(() => r()));
    }
});

test('project_run accepts a port it did not choose only from its own process, and gives the table the time it needs', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRunTool.ts'), 'utf8');
    //  Rejected only when the machine says another process holds it; an unreadable table rejects nothing.
    expect(source).toMatch(/if \(p !== port && \(await heldByLaunched\(p, Number\(pid\)\)\) === false\) \{\s*foreignPorts\.add\(p\);/);
    //  10.4 s measured for the table on his laptop: 10 s timed out three attempts in a row.
    expect(source).toMatch(/id: `project-run-port-listener-[\s\S]{0,400}timeout: 25000/);
});
