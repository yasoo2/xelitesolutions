import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { workspaceService } from '../modules/services/WorkspaceService';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { listsProjectFiles } from '../modules/tools/preview-site';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Review r21 (b4094048): the listing detector called any page that links two
 * of the project's top-level entries, one of them a folder, «a list of the
 * project's files». An Express/EJS app whose home page links /admin and
 * /api/health, in a project with admin/ and api/ folders, was killed by
 * project_run as a file listing. And a listing of a SUBFOLDER (`serve www`,
 * no index.html there) was not seen at all: the app was «running».
 *
 * Both cases below are real servers the project's own start script launches
 * on 127.0.0.1; project_run decides from what they answer.
 */
jest.setTimeout(120_000);
const roots: string[] = [];
const sessions: string[] = [];
const get = (url: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    http.get(url, res => { let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode || 0, body })); }).on('error', reject);
});

// An Express-shaped app without the dependency: routes, a rendered home page, a JSON health route.
const APP = [
    "const http = require('http');",
    "const health = require('./api/health');",
    "const home = '<!doctype html><html lang=\"en\"><head><title>Clinic admin</title><link rel=\"stylesheet\" href=\"/public/styles.css\"></head><body>'",
    "  + '<nav><a href=\"/\">home</a><a href=\"/admin\">admin</a><a href=\"/api\">api</a><a href=\"/api/health\">health</a></nav>'",
    "  + '<h1>Appointments today</h1><form method=\"post\" action=\"/admin\"><input name=\"patient\"><button>Book</button></form></body></html>';",
    "http.createServer((req, res) => {",
    "  if (req.url === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(health())); }",
    "  if (req.url === '/' ) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(home); }",
    "  res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>' + req.url + '</h1>');",
    "}).listen(Number(process.env.PORT), '127.0.0.1');",
].join('\n');

// A static lister like `python -m http.server -d www` or `serve www`: the folder in argv, relative hrefs, names as text.
const LISTER = [
    "const http = require('http'); const fs = require('fs'); const path = require('path');",
    "const folder = path.resolve(process.argv[2] || '.');",
    "http.createServer((req, res) => {",
    "  const items = fs.readdirSync(folder).map(n => { const d = fs.statSync(path.join(folder, n)).isDirectory() ? '/' : '';",
    "    return '<li><a href=\"' + encodeURIComponent(n) + d + '\">' + n + d + '</a></li>'; }).join('');",
    "  res.writeHead(200, { 'content-type': 'text/html' });",
    "  res.end('<!DOCTYPE HTML><html><title>Directory listing for /</title><body><h1>Directory listing for /</h1><hr><ul>' + items + '</ul><hr></body></html>');",
    "}).listen(Number(process.env.PORT), '127.0.0.1');",
].join('\n');

function workspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-run-app-'));
    roots.push(root);
    jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
    return root;
}

function write(dir: string, files: Record<string, string>): string {
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
}

const run = (dir: string, sessionId: string) => {
    sessions.push(sessionId);
    return executionFirewall.runInContext(`run-${sessionId}`, () =>
        new ProjectRunTool().execute({ cwd: dir }, { sessionId, workspaceId: 'w', userId: 'u' })) as Promise<any>;
};

describe('a working app is not a file listing, and a listing of any served folder is', () => {
    afterAll(async () => {
        for (const sessionId of sessions) {
            await executionFirewall.runInContext(`stop-${sessionId}`, () =>
                new ProjectStopTool().execute({}, { sessionId, workspaceId: 'w', userId: 'u' })).catch(() => undefined);
        }
        jest.restoreAllMocks();
        for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    });

    it('an Express-shaped app whose home links /admin and /api/health stays running', async () => {
        const dir = write(path.join(workspace(), 'clinic-admin'), {
            'package.json': JSON.stringify({ name: 'clinic-admin', scripts: { start: 'node server.js' } }),
            'server.js': APP,
            'api/health.js': "module.exports = () => ({ ok: true, service: 'clinic-admin' });",
            'admin/dashboard.ejs': '<h1>Dashboard</h1>',
            'views/index.ejs': '<h1><%= title %></h1>',
            'public/styles.css': 'h1{font-size:2rem}',
        });
        const res = await run(dir, 'app-is-not-listing');
        expect(res.ok).toBe(true);
        expect(res.output.note).toBeUndefined();
        expect(res.output.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        // Still the app, still answering, after project_run returned.
        const health = await get(`${res.output.url}api/health`);
        expect(health.status).toBe(200);
        expect(JSON.parse(health.body)).toEqual({ ok: true, service: 'clinic-admin' });
        expect((await get(res.output.url)).body).toContain('Appointments today');
    });

    it('a server listing a subfolder that has no index.html is reported as the listing it is', async () => {
        const dir = write(path.join(workspace(), 'price-site'), {
            'package.json': JSON.stringify({ name: 'price-site', scripts: { start: 'node lister.js www' } }),
            'lister.js': LISTER,
            'README.md': '# prices',
            'www/about.html': '<h1>About</h1>',
            'www/contact.html': '<h1>Contact</h1>',
            'www/app.js': 'console.log(1)',
            'www/price list.txt': '10',
            'www/img/logo.svg': '<svg/>',
        });
        const res = await run(dir, 'subfolder-listing');
        expect(res.ok).toBe(false);
        expect(res.output?.note).toBe('served_file_listing');
        expect(res.output?.url).toBeUndefined();
    });
});

describe('the listing evidence itself', () => {
    const project = () => write(fs.mkdtempSync(path.join(os.tmpdir(), 'joe-listing-unit-')), {
        'package.json': '{}', 'server.js': '', 'README.md': '', 'admin/x.ejs': '', 'api/health.js': '', 'views/index.ejs': '',
    });
    afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

    it('serve-index (title attribute, name inside spans) of the project root is a listing', async () => {
        const dir = project(); roots.push(dir);
        const page = ['admin', 'api', 'views', 'package.json', 'server.js', 'README.md'].map(n =>
            `<li><a href="/${n}" class="icon" title="${n}"><span class="name">${n}</span><span class="size">1 kB</span><span class="date">10/28/2026</span></a></li>`).join('');
        await expect(listsProjectFiles(`<ul id="files">${page}</ul>`, dir, 'http://127.0.0.1:4100/')).resolves.toBe(true);
    });

    it('a page naming two folders among many entries is not, nor are routes, deeper links or anchors', async () => {
        const dir = project(); roots.push(dir);
        await expect(listsProjectFiles('<a href="/admin">admin</a><a href="/api">api</a><a href="/api/health">health</a><a href="#top">top</a>', dir)).resolves.toBe(false);
        await expect(listsProjectFiles('<a href="/admin">Admin panel</a><a href="/views">Our views</a><a href="/api/">API</a>', dir)).resolves.toBe(false);
    });
});
