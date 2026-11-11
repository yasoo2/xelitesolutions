import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import { AddressInfo } from 'net';
import { previewKey, staticSiteRoot, whyNoStaticSite } from '../modules/tools/preview-site';
import { resolvePreviewFile } from '../api/routes/projectPreview';
import { localLivePreviewFor } from '../modules/tools/definitions/BrowserRunTool';
import { STATIC_PREVIEW_SERVER_SOURCE } from '../modules/tools/definitions/ProjectRunTool';

/**
 * Eval round 14, 2026-10-24 (P001, 2 h): a landing page Joe wrote file by file
 * (clinic-landing-ar/src/index.html, styles.css, app.js — no bundler, no
 * dist/; package.json's only script «node src/index.js» named a missing file)
 * reached its browser QA phase with no address. Blockers: the lookup used the
 * browser panel id («browser:<chat>») instead of the chat id; project_run
 * refused the missing target; the preview route serves only dist/.
 *
 * Two adversarial reviews rejected serving source folders through the public
 * /project-preview route (no auth, 0.0.0.0): secrets readable from the LAN,
 * Windows 8.3 short names past the dot rule, a synchronous crawl per request.
 * So a static site is served only by project_run's strict server on
 * 127.0.0.1, only after the project's own start failed, and the public route
 * stays build-output only.
 */
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function project(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-static-site-'));
    roots.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
}
const PAGE = '<!doctype html><html><head><link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="styles.css"><link href="https://fonts.googleapis.com/css2?family=Tajawal" rel="stylesheet"></head><body><a href="/">home</a><script type="module" src="app.js"></script></body></html>';
const P001 = {
    'package.json': JSON.stringify({ name: 'clinic', type: 'module', scripts: { dev: 'node src/index.js' } }),
    'src/index.html': PAGE, 'src/styles.css': 'body{}', 'src/app.js': 'void 0;', 'src/mod.mjs': 'export default 1;',
    'src/.env': 'SECRET=1', 'src/raw.bin': 'x', '.engineering-checkpoints/x.json': '{}',
};

describe('which projects are static sites', () => {
    it('the P001 shape — src/index.html, a dev script naming a missing file — is one, served from src/', () => {
        const dir = project(P001);
        expect(staticSiteRoot(dir, { servedAtRoot: true })).toBe(path.join(dir, 'src'));
    });
    it('a root-absolute favicon is fine at a server root, not under a sub-path', () => {
        const dir = project(P001);
        expect(staticSiteRoot(dir)).toBeNull();
        expect(whyNoStaticSite(dir)).toMatch(/dist\/index\.html/);
    });
    it('a project that needs a build never serves its sources', () => {
        const vite = project({ 'package.json': JSON.stringify({ scripts: { build: 'vite build' }, devDependencies: { vite: '^5' } }), 'index.html': '<script type="module" src="/src/main.tsx"></script>' });
        expect(staticSiteRoot(vite, { servedAtRoot: true })).toBeNull();
        expect(whyNoStaticSite(vite)).toMatch(/dist\/index\.html.*build script/);
        expect(staticSiteRoot(project({ 'tsconfig.json': '{}', 'index.html': PAGE }), { servedAtRoot: true })).toBeNull();
        expect(staticSiteRoot(project({ 'index.html': '<script src="main.tsx"></script>' }), { servedAtRoot: true })).toBeNull();
    });
    it('a commented-out tag is not a reference', () => {
        expect(staticSiteRoot(project({ 'index.html': '<!-- <script src="main.tsx"></script> --><p>hi</p>' }), { servedAtRoot: true })).not.toBeNull();
    });
});

describe('the public preview route stays build-output only', () => {
    const saved = (global as any).joeProjects;
    afterEach(() => { (global as any).joeProjects = saved; });

    it('a static source folder is NOT served through /project-preview', () => {
        const dir = project(P001);
        (global as any).joeProjects = { chat42: { dir, type: 'scaffold' } };
        expect(resolvePreviewFile('chat42', 'index.html')).toBeNull();
        expect(resolvePreviewFile('chat42', 'styles.css')).toBeNull();
    });
    it('dist/ is still served, and Windows short names and junction escapes are refused', () => {
        const dir = project({ 'dist/index.html': '<p>built</p>', 'dist/.env': 'SECRET=1' });
        (global as any).joeProjects = { chat42: { dir, type: 'react' } };
        expect(resolvePreviewFile('chat42', 'index.html')).toBe(path.join(dir, 'dist', 'index.html'));
        expect(resolvePreviewFile('chat42', '.env')).toBeNull();
        expect(resolvePreviewFile('chat42', 'ENV~1')).toBeNull();
    });
});

describe('browser_run finds the chat\'s project', () => {
    const saved = (global as any).joeProjects;
    afterEach(() => { (global as any).joeProjects = saved; });

    it('looks up the chat id, not the browser panel id, and prefers the loopback live server', () => {
        const dir = project(P001);
        (global as any).joeProjects = { chat42: { dir, type: 'scaffold', live: { url: 'http://127.0.0.1:4310/' } } };
        expect(previewKey('browser:chat42')).toBe('chat42');
        expect(localLivePreviewFor('chat42')).toBe('http://127.0.0.1:4310/');
        expect(localLivePreviewFor('browser:chat42')).toBe('http://127.0.0.1:4310/');
    });
    it('an IPv6 loopback live URL is accepted ([::1] keeps its brackets in URL.hostname)', () => {
        (global as any).joeProjects = { chat42: { dir: os.tmpdir(), live: { url: 'http://[::1]:4300/' } } };
        expect(localLivePreviewFor('chat42')).toBe('http://[::1]:4300/');
    });
    it('the wiring: project_run falls back to the site only after its own start failed; browser_run starts it when it has no address', () => {
        const run = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRunTool.ts'), 'utf8');
        expect(run).toMatch(/if \(launchability\) \{\s*const servedStatically = await staticSiteFallback\(launchability\);/);
        expect(run).toContain("const servedStatically = await staticSiteFallback('the start command answered on no port');");
        expect(run).not.toMatch(/const staticSite = !input\?\.command \? resolvePreviewSite/);
        const browser = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'BrowserRunTool.ts'), 'utf8');
        expect(browser).toContain('activePreview = await startLocalSitePreview(');
    });
});

describe('the strict loopback server', () => {
    let child: ChildProcess | undefined;
    afterAll(() => { try { child?.kill(); } catch { /* gone */ } });

    const freePort = () => new Promise<number>(resolve => {
        const s = http.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => resolve(p)); });
    });
    const get = (port: number, p: string, host?: string) => new Promise<{ status: number; body: string; type: string }>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: p, headers: host ? { Host: host } : undefined }, res => { let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode || 0, body, type: String(res.headers['content-type'] || '') })); }).on('error', reject);
    });

    it('serves real files with the right type; refuses dot, short-name, unknown-type, missing and foreign-Host requests', async () => {
        const dir = project(P001);
        const root = path.join(dir, 'src');
        const port = await freePort();
        child = spawn(process.execPath, ['-e', STATIC_PREVIEW_SERVER_SOURCE], { cwd: root, env: { ...process.env, PORT: String(port), JOE_STATIC_STRICT: '1' }, stdio: 'ignore' });
        for (let i = 0; i < 40; i++) { try { await get(port, '/'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
        expect(await get(port, '/')).toMatchObject({ status: 200 });
        expect(await get(port, '/styles.css')).toMatchObject({ status: 200, type: expect.stringContaining('text/css') });
        expect(await get(port, '/mod.mjs')).toMatchObject({ status: 200, type: expect.stringContaining('text/javascript') });
        expect((await get(port, '/.env')).status).toBe(404);
        expect((await get(port, '/ENV~1')).status).toBe(404);
        expect((await get(port, '/raw.bin')).status).toBe(404);
        expect((await get(port, '/missing.css')).status).toBe(404);
        expect((await get(port, '/%2e%2e/package.json')).status).not.toBe(200);
        expect((await get(port, '/', 'evil.example:80')).status).toBe(421);
        expect((await get(port, '/', `localhost:${port}`)).status).toBe(200);
    }, 60_000);
});
