import fs from 'fs';
import os from 'os';
import net from 'net';
import path from 'path';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import { AddressInfo } from 'net';
import { workspaceService } from '../modules/services/WorkspaceService';
import { ProjectRunTool, ProjectStopTool, STATIC_PREVIEW_SERVER_SOURCE } from '../modules/tools/definitions/ProjectRunTool';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * 2026-11-05, the morning after the hard exam: ten preview servers from the
 * day before were still running on his machine, owned by no Joe. Each was the
 * one project_run starts for a site with no start of its own —
 * «npx -y serve -l <port> -s .». Measured on that command:
 *
 *   it listens on «::», every interface — HOST=127.0.0.1 is not read by serve —
 *   so the machine's Wi-Fi address answered the page;
 *   from that address it handed out .joe/history.json, the requests he typed;
 *   a missing file answered 200 with index.html (-s), so browser QA saw a page
 *   where the site had a broken link;
 *   and it is five processes deep (cmd → cmd → npx → serve), so the pid Joe
 *   recorded was never the server, and a restart left the server behind.
 *
 * Joe already has the server for this: the strict one the fallback uses,
 * on 127.0.0.1, one process. A site with no start of its own now gets that.
 */
jest.setTimeout(120_000);
const roots: string[] = [];
const get = (url: string, host?: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const u = new URL(url);
    http.get({ host: u.hostname, port: u.port, path: u.pathname, headers: host ? { Host: host } : undefined }, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    }).on('error', reject);
});
/** Does anything answer at this address and port? */
const connects = (address: string, port: number) => new Promise<boolean>(resolve => {
    const socket = net.connect({ host: address, port });
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(1500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
});
/** One address of this machine that is not loopback, if it has one. */
const outwardAddress = (): string => {
    for (const list of Object.values(os.networkInterfaces())) {
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
    }
    return '';
};

describe('a site with no start of its own', () => {
    const tool = new ProjectRunTool();
    const context = { sessionId: 'static-own-server-session', workspaceId: 'w', userId: 'u' };
    afterAll(async () => {
        await executionFirewall.runInContext('static-own-server-stop', () => new ProjectStopTool().execute({}, context)).catch(() => undefined);
        for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    });

    it('is served by Joe\'s own server, on this machine only, with honest answers', async () => {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-own-static-'));
        roots.push(workspace);
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace);
        const dir = path.join(workspace, 'charity-quiz');
        fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>quiz</title><link rel="stylesheet" href="styles.css"><a href="about">about</a><h1>quiz</h1>');
        fs.writeFileSync(path.join(dir, 'about.html'), '<!doctype html><title>about</title><h1>about us</h1>');
        fs.writeFileSync(path.join(dir, 'styles.css'), 'h1{}');
        fs.writeFileSync(path.join(dir, '.joe', 'history.json'), JSON.stringify([{ request: 'what he typed' }]));

        const res: any = await executionFirewall.runInContext('static-own-server', () => tool.execute({ cwd: dir }, context));
        expect(res.ok).toBe(true);
        expect(res.output.command).toBe('node static-preview');
        const url = String(res.output.url);
        expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        const port = Number(new URL(url).port);
        expect(res.output.port).toBe(port);

        expect((await get(url)).body).toContain('quiz');
        expect((await get(url + 'styles.css')).status).toBe(200);
        // A link without its .html still opens the page, as static hosts do.
        expect(await get(url + 'about')).toMatchObject({ status: 200, body: expect.stringContaining('about us') });
        expect((await get(url + 'missing.js')).status).toBe(404);
        expect((await get(url + '.joe/history.json')).status).toBe(404);
        expect((await get(url, 'evil.example')).status).toBe(421);

        const outward = outwardAddress();
        if (outward) expect(await connects(outward, port)).toBe(false);
    });
});

describe('the strict server opens a page by its name without .html', () => {
    let child: ChildProcess | undefined;
    afterAll(() => { try { child?.kill(); } catch { /* gone */ } });

    it('/about is about.html; a folder still opens its index; nothing else is guessed', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-clean-url-'));
        roots.push(root);
        fs.writeFileSync(path.join(root, 'index.html'), '<p>home</p>');
        fs.writeFileSync(path.join(root, 'about.html'), '<p>about</p>');
        fs.mkdirSync(path.join(root, 'blog'));
        fs.writeFileSync(path.join(root, 'blog', 'index.html'), '<p>blog</p>');
        fs.writeFileSync(path.join(root, '.secret.html'), '<p>hidden</p>');
        const port = await new Promise<number>(resolve => {
            const s = http.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => resolve(p)); });
        });
        child = spawn(process.execPath, ['-e', STATIC_PREVIEW_SERVER_SOURCE], { cwd: root, env: { ...process.env, PORT: String(port), JOE_STATIC_STRICT: '1' }, stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 40; i++) { try { await get(base); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
        expect(await get(base + 'about')).toMatchObject({ status: 200, body: '<p>about</p>' });
        expect(await get(base + 'about.html')).toMatchObject({ status: 200, body: '<p>about</p>' });
        expect(await get(base + 'blog')).toMatchObject({ status: 200, body: '<p>blog</p>' });
        expect((await get(base + 'contact')).status).toBe(404);
        expect((await get(base + '.secret')).status).toBe(404);
        expect((await get(base + 'about.css')).status).toBe(404);
    });
});
