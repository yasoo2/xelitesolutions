import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { workspaceService } from '../modules/services/WorkspaceService';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { listsProjectFiles } from '../modules/tools/preview-site';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Eval run500, 2026-10-27 (P001-landing-ar): the site was src/index.html and
 * the start script «npx serve -l 8080» served the project ROOT, so the live
 * preview was serve's «Files within dental-clinic-site» listing. project_run
 * called it running; browser QA failed it as an empty page with flat headings,
 * and repair had nothing of the site to change.
 */
jest.setTimeout(120_000);
const roots: string[] = [];
const get = (url: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    http.get(url, res => { let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode || 0, body })); }).on('error', reject);
});

// What `serve` 14 answers on Windows for a folder without index.html.
const SERVE_WINDOWS_LISTING = '<!DOCTYPE html><html lang="en"><head><title>Files within dental-clinic-site\\</title></head><body><main><header><h1><i>Index of&nbsp;</i><a href="/">dental-clinic-site&#47;</a></h1></header><ul id="files">'
    + '<li><a href="\\docs&#47;" title="docs&#47;" class="folder ">docs&#47;</a></li>'
    + '<li><a href="\\src&#47;" title="src&#47;" class="folder ">src&#47;</a></li>'
    + '<li><a href="\\package.json" title="package.json" class="file json">package.json</a></li>'
    + '<li><a href="\\README.md" title="README.md" class="file md">README.md</a></li></ul></main></body></html>';

// A start script that does what serve did: answer on PORT with its folder's list.
const LISTER = [
    "const http = require('http'); const fs = require('fs');",
    "http.createServer((req, res) => {",
    "  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^[\\\\/]+/, '');",
    "  if (rel && fs.existsSync(rel) && fs.statSync(rel).isFile()) { res.writeHead(200); return res.end(fs.readFileSync(rel)); }",
    "  const items = fs.readdirSync('.').map(n => '<li><a href=\"\\\\' + n + (fs.statSync(n).isDirectory() ? '&#47;' : '') + '\">' + n + '</a></li>').join('');",
    "  res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>Files within</title><ul>' + items + '</ul>');",
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

function project(shape: { site: boolean }): string {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-run-listing-'));
    roots.push(workspace);
    const dir = path.join(workspace, 'dental-clinic-site');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'dental-clinic-site', scripts: { start: 'node lister.js' } }));
    fs.writeFileSync(path.join(dir, 'lister.js'), LISTER);
    fs.writeFileSync(path.join(dir, 'README.md'), '# clinic');
    if (shape.site) {
        fs.writeFileSync(path.join(dir, 'src', 'index.html'), '<!doctype html><html lang="ar" dir="rtl"><title>عيادة</title><link rel="stylesheet" href="styles.css"><h1>عيادة الابتسامة</h1><a href="#services">الخدمات</a>');
        fs.writeFileSync(path.join(dir, 'src', 'styles.css'), 'h1{font-size:2rem}');
    } else {
        fs.writeFileSync(path.join(dir, 'src', 'notes.txt'), 'no page yet');
    }
    jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace);
    return dir;
}

describe('a server that lists the project files is not serving the site', () => {
    const context = { sessionId: 'listing-e2e-session', workspaceId: 'w', userId: 'u' };
    afterAll(async () => {
        await executionFirewall.runInContext('listing-e2e-stop', () => new ProjectStopTool().execute({}, context)).catch(() => undefined);
        for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    });

    it('recognises serve\'s Windows listing of the project folder, and not a page that links its own files', async () => {
        const dir = project({ site: true });
        const served = await fileServer(dir);
        try {
            expect(await listsProjectFiles(SERVE_WINDOWS_LISTING, dir, served.url)).toBe(true);
            const page = '<nav><a href="index.html">الرئيسية</a><a href="styles.css">x</a><a href="#contact">تواصل</a><a href="https://example.com/src/">ext</a></nav>';
            expect(await listsProjectFiles(page, dir, served.url)).toBe(false);
            // A folder that holds its own page is answered with it, never listed.
            fs.writeFileSync(path.join(dir, 'index.html'), '<h1>root</h1>');
            expect(await listsProjectFiles(SERVE_WINDOWS_LISTING, dir, served.url)).toBe(false);
        } finally { await served.close(); }
    });

    it('the P001 shape is served from src/, not as a file listing', async () => {
        const dir = project({ site: true });
        const res: any = await executionFirewall.runInContext('listing-e2e', () => new ProjectRunTool().execute({ cwd: dir }, context));
        expect(res.ok).toBe(true);
        expect(res.output.kind).toBe('static-site');
        const page = await get(res.output.url);
        expect(page.status).toBe(200);
        expect(page.body).toContain('عيادة الابتسامة');
        expect(page.body).not.toContain('Files within');
    });

    it('with no page to serve, a listing is reported as a failed start, not a running app', async () => {
        const dir = project({ site: false });
        const res: any = await executionFirewall.runInContext('listing-e2e-none', () => new ProjectRunTool().execute({ cwd: dir }, context));
        expect(res.ok).toBe(false);
        expect(res.output?.note).toBe('served_file_listing');
        expect(res.output?.url).toBeUndefined();
    });
});
