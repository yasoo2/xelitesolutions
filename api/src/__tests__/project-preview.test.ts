/**
 * THE LIVE PREVIEW LOOP, locked.
 *
 * Pages preview through /artifacts; a React project's dist previews through
 * /project-preview/:key — resolved at REQUEST time from joeProjects so the
 * URL follows the session's active project. These locks pin the resolver's
 * safety (no path escapes, honest 404s) and the wiring: the scaffolder and
 * the surgical editor both announce preview_ready on a green build, and the
 * SPA fallback must not swallow the route.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('resolvePreviewFile — the request-time resolver', () => {
    const { resolvePreviewFile } = require('../api/routes/projectPreview');
    let tmp: string;
    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-preview-'));
        fs.mkdirSync(path.join(tmp, 'proj', 'dist', 'assets'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'proj', 'dist', 'index.html'), '<html>app</html>');
        fs.writeFileSync(path.join(tmp, 'proj', 'dist', 'assets', 'a.js'), 'x');
        fs.writeFileSync(path.join(tmp, 'secret.txt'), 'nope');
        (global as any).joeProjects = { ...(global as any).joeProjects, 'pv-t': { dir: path.join(tmp, 'proj') } };
    });
    afterAll(() => {
        delete (global as any).joeProjects?.['pv-t'];
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('an empty path serves the dist index', () => {
        expect(resolvePreviewFile('pv-t', '')).toBe(path.join(tmp, 'proj', 'dist', 'index.html'));
    });
    it('assets resolve inside the dist', () => {
        expect(resolvePreviewFile('pv-t', 'assets/a.js')).toBe(path.join(tmp, 'proj', 'dist', 'assets', 'a.js'));
    });
    it('a traversal attempt dies at the boundary', () => {
        expect(resolvePreviewFile('pv-t', '../../secret.txt')).toBeNull();
        expect(resolvePreviewFile('pv-t', '..%2F..%2Fsecret.txt')).toBeNull();
    });
    it('an unknown session and a missing dist answer null, never throw', () => {
        expect(resolvePreviewFile('nobody', '')).toBeNull();
        (global as any).joeProjects['pv-t'].dir = path.join(tmp, 'gone');
        expect(resolvePreviewFile('pv-t', '')).toBeNull();
        (global as any).joeProjects['pv-t'].dir = path.join(tmp, 'proj');
    });
});

describe('the preview loop is WIRED, end to end', () => {
    it('app.ts mounts /project-preview and the SPA fallback skips it', () => {
        const app = fs.readFileSync(path.join(__dirname, '..', 'api', 'app.ts'), 'utf-8');
        expect(app).toContain("app.use('/project-preview', projectPreviewRoutes)");
        const fallback = app.slice(app.indexOf('req.path.startsWith'));
        expect(fallback).toContain("req.path.startsWith('/project-preview')");
    });
    it('a built react_project announces preview_ready through the route', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        const at = src.indexOf('/project-preview/');
        expect(at).toBeGreaterThan(0);
        expect(src.slice(at - 400, at + 200)).toContain("type: 'preview_ready'");
        expect(src.slice(at - 400, at + 200)).toContain('if (built)');   // an unbuilt scaffold has nothing to show
    });
    it('a build-verified surgical edit refreshes the preview — and ONLY a verified one', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectEditTool.ts'), 'utf-8');
        const at = src.indexOf('/project-preview/');
        expect(at).toBeGreaterThan(0);
        expect(src.slice(at - 500, at + 200)).toContain('buildVerified === true');
        expect(src.slice(at - 500, at + 200)).toContain("type: 'preview_ready'");
    });
});
