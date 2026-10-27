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
    "  const items = fs.readdirSync('.').map(n => '<li><a href=\"\\\\' + n + (fs.statSync(n).isDirectory() ? '&#47;' : '') + '\">' + n + '</a></li>').join('');",
    "  res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>Files within</title><ul>' + items + '</ul>');",
    "}).listen(Number(process.env.PORT), '127.0.0.1');",
].join('\n');

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

    it('recognises serve\'s Windows listing of the project folder, and not a page that links its own files', () => {
        const dir = project({ site: true });
        expect(listsProjectFiles(SERVE_WINDOWS_LISTING, dir)).toBe(true);
        const page = '<nav><a href="index.html">الرئيسية</a><a href="styles.css">x</a><a href="#contact">تواصل</a><a href="https://example.com/src/">ext</a></nav>';
        expect(listsProjectFiles(page, dir)).toBe(false);
        // A project whose root holds its own page is never judged.
        fs.writeFileSync(path.join(dir, 'index.html'), '<h1>root</h1>');
        expect(listsProjectFiles(SERVE_WINDOWS_LISTING, dir)).toBe(false);
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
