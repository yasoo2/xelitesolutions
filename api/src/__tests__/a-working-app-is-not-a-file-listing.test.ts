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
    "  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\\/+/, '');",
    "  const at = path.join(folder, rel);",
    "  let stat; try { stat = fs.statSync(at); } catch { res.writeHead(404); return res.end('not found'); }",
    "  if (stat.isFile()) { res.writeHead(200); return res.end(fs.readFileSync(at)); }",
    "  const items = fs.readdirSync(at).map(n => { const d = fs.statSync(path.join(at, n)).isDirectory() ? '/' : '';",
    "    return '<li><a href=\"' + encodeURIComponent(n) + d + '\">' + n + d + '</a></li>'; }).join('');",
    "  res.writeHead(200, { 'content-type': 'text/html' });",
    "  res.end('<!DOCTYPE HTML><html><title>Directory listing for /' + rel + '</title><body><h1>Directory listing for /' + rel + '</h1><hr><ul>' + items + '</ul><hr></body></html>');",
    "}).listen(Number(process.env.PORT), '127.0.0.1');",
].join('\n');

// A file server as `serve` and `python -m http.server` are: a folder answers
// with its listing, a file with its own bytes. The detector asks the server.
async function fileServer(root: string): Promise<{ url: string; close: () => Promise<void> }> {
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^[\\/]+/, '');
        const at = path.join(root, rel);
        let stat: fs.Stats;
        try { stat = fs.statSync(at); } catch { res.writeHead(404); res.end(); return; }
        if (stat.isFile()) { res.writeHead(200); res.end(fs.readFileSync(at)); return; }
        const items = fs.readdirSync(at).map(n => `<li><a href="${encodeURIComponent(n)}${fs.statSync(path.join(at, n)).isDirectory() ? '/' : ''}">${n}</a></li>`).join('');
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<ul>${items}</ul>`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${(server.address() as any).port}/`, close: () => new Promise<void>(done => server.close(() => done())) };
}

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

    it('…nor is it when its server lives in src/ beside the folders its home links (review r21, second round)', async () => {
        // src/ holds server.js, admin/ and api/: the home names two of its three
        // entries. The server, asked for /admin/, answers with the app, not a listing.
        const dir = write(path.join(workspace(), 'clinic-admin-src'), {
            'package.json': JSON.stringify({ name: 'clinic-admin-src', scripts: { start: 'node src/server.js' } }),
            'src/server.js': APP,
            'src/api/health.js': "module.exports = () => ({ ok: true, service: 'clinic-admin' });",
            'src/admin/dashboard.ejs': '<h1>Dashboard</h1>',
        });
        const res = await run(dir, 'app-in-src-is-not-listing');
        expect(res.ok).toBe(true);
        expect(res.output.note).toBeUndefined();
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
        const served = await fileServer(dir);
        try {
            await expect(listsProjectFiles(`<ul id="files">${page}</ul>`, dir, served.url)).resolves.toBe(true);
        } finally { await served.close(); }
    });

    it('a page whose links match a folder\'s entries is not a listing when the server answers them as an app (review r21, second round)', async () => {
        const dir = write(fs.mkdtempSync(path.join(os.tmpdir(), 'joe-listing-bilingual-')), {
            'package.json': '{}', 'server.js': '', 'locales/en/common.json': '{}', 'locales/ar/common.json': '{}',
        });
        roots.push(dir);
        const page = '<header><a href="/en">en</a> | <a href="/ar">ar</a></header><h1>Clinic</h1>';
        const app = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); });
        await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
        try {
            await expect(listsProjectFiles(page, dir, `http://127.0.0.1:${(app.address() as any).port}/`)).resolves.toBe(false);
        } finally { await new Promise<void>(done => app.close(() => done())); }
    });

    it('a page naming two folders among many entries is not, nor are routes, deeper links or anchors', async () => {
        const dir = project(); roots.push(dir);
        await expect(listsProjectFiles('<a href="/admin">admin</a><a href="/api">api</a><a href="/api/health">health</a><a href="#top">top</a>', dir)).resolves.toBe(false);
        await expect(listsProjectFiles('<a href="/admin">Admin panel</a><a href="/views">Our views</a><a href="/api/">API</a>', dir)).resolves.toBe(false);
    });
});
