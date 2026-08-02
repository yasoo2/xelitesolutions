/**
 * The build→publish chain: «انشر المشروع» right after «تم بناء الصفحة» must
 * publish THAT page — self-contained — not answer «لا شيء ثابت لنشره».
 *
 * Two measured breaks this locks shut:
 *   1. deploy_pages only ever looked at the workspace root; the built page
 *      lives in the artifacts dir.
 *   2. real photographs are src="/artifacts/images/…" — a path only Joe's
 *      local server answers; published verbatim, every image 404s.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { findBuiltArtifact, stageForPages } from '../core/deploy/publish-source';

const deploySrc = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'DeployPagesTool.ts'), 'utf-8');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'joe-pub-'));

afterEach(() => { delete (global as any).joePages; });

describe('findBuiltArtifact — what «انشر» refers to', () => {
    test('prefers the session\'s site, then its project dir, then the single file', () => {
        const art = tmp();
        // single file only
        fs.writeFileSync(path.join(art, 'joe-s1.html'), '<html></html>');
        expect(findBuiltArtifact({ sessionId: 's1', artifactDir: art })!.kind).toBe('page');
        // project dir beats the single file
        fs.mkdirSync(path.join(art, 'joe-s1'));
        fs.writeFileSync(path.join(art, 'joe-s1', 'index.html'), '<html></html>');
        expect(findBuiltArtifact({ sessionId: 's1', artifactDir: art })!.kind).toBe('project');
        // a site in the session store beats both
        fs.mkdirSync(path.join(art, 'site-s1'));
        fs.writeFileSync(path.join(art, 'site-s1', 'index.html'), '<html></html>');
        (global as any).joePages = { s1: { site: { dir: 'site-s1', pages: [] } } };
        expect(findBuiltArtifact({ sessionId: 's1', artifactDir: art })!.kind).toBe('site');
    });

    test('after a restart (no session store) the newest File-Explorer mirror is found', () => {
        const art = tmp(); const root = tmp();
        const a = path.join(root, 'joe-output', 'joe-old');
        const b = path.join(root, 'joe-output', 'joe-new');
        fs.mkdirSync(a, { recursive: true }); fs.mkdirSync(b, { recursive: true });
        fs.writeFileSync(path.join(a, 'index.html'), 'old');
        fs.writeFileSync(path.join(b, 'index.html'), 'new');
        fs.utimesSync(a, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
        const got = findBuiltArtifact({ sessionId: 'gone', artifactDir: art, explorerRoot: root });
        expect(got!.dir).toBe(b);
    });

    test('nothing built → null (the caller says so honestly)', () => {
        expect(findBuiltArtifact({ sessionId: 'none', artifactDir: tmp(), explorerRoot: tmp() })).toBeNull();
    });
});

describe('stageForPages — the published folder depends on NO Joe server', () => {
    test('a single page becomes index.html and its /artifacts/ images are localized', () => {
        const art = tmp(); const stage = tmp();
        fs.mkdirSync(path.join(art, 'images'), { recursive: true });
        fs.writeFileSync(path.join(art, 'images', 'store front.jpg'), 'JPG');
        fs.writeFileSync(path.join(art, 'p.html'),
            '<html><body><img src="/artifacts/images/store%20front.jpg">'
            + '<div style="background:url(/artifacts/images/store%20front.jpg)"></div>'
            + '<img src="/artifacts/images/missing.jpg"></body></html>');
        const r = stageForPages({ kind: 'page', file: path.join(art, 'p.html'), labelAr: 'x' }, stage, art);
        const out = fs.readFileSync(path.join(stage, 'index.html'), 'utf-8');
        expect(fs.existsSync(path.join(stage, 'images', 'store front.jpg'))).toBe(true);
        // Re-encoded on the way out — a bare space in url(...) is invalid CSS.
        expect(out).toContain('src="images/store%20front.jpg"');
        expect(out).toContain('url(images/store%20front.jpg');
        // The missing one is reported, not silently rewritten to another 404.
        expect(r.unresolved).toEqual(['/artifacts/images/missing.jpg']);
        expect(out).toContain('/artifacts/images/missing.jpg');
        expect(r.assetsLocalized).toBe(1);
    });

    test('a project dir is copied whole; css references are rewritten too', () => {
        const art = tmp(); const stage = tmp();
        fs.mkdirSync(path.join(art, 'joe-x'), { recursive: true });
        fs.mkdirSync(path.join(art, 'images'), { recursive: true });
        fs.writeFileSync(path.join(art, 'images', 'hero.jpg'), 'JPG');
        fs.writeFileSync(path.join(art, 'joe-x', 'index.html'), '<link rel="stylesheet" href="styles.css">');
        fs.writeFileSync(path.join(art, 'joe-x', 'styles.css'), '.hero{background-image:url("/artifacts/images/hero.jpg")}');
        stageForPages({ kind: 'project', dir: path.join(art, 'joe-x'), labelAr: 'x' }, stage, art);
        const css = fs.readFileSync(path.join(stage, 'styles.css'), 'utf-8');
        expect(css).toContain('url("images/hero.jpg")');
        expect(fs.existsSync(path.join(stage, 'images', 'hero.jpg'))).toBe(true);
    });

    test('a reference cannot climb out of the artifacts dir', () => {
        const art = tmp(); const stage = tmp();
        const secret = path.join(path.dirname(art), `secret-${path.basename(art)}.txt`);
        fs.writeFileSync(secret, 'SECRET');
        fs.writeFileSync(path.join(art, 'p.html'),
            `<img src="/artifacts/../${path.basename(secret)}">`);
        const r = stageForPages({ kind: 'page', file: path.join(art, 'p.html'), labelAr: 'x' }, stage, art);
        expect(r.assetsLocalized).toBe(0);
        expect(r.unresolved.length).toBe(1);
        fs.rmSync(secret, { force: true });
    });
});

describe('deploy_pages uses the chain', () => {
    test('it resolves the built artifact when the workspace has nothing static', () => {
        expect(deploySrc).toMatch(/findBuiltArtifact\(\{/);
        expect(deploySrc).toMatch(/stageForPages\(built/);
        expect(deploySrc).toMatch(/getExplorerRoot\(\)/);
    });
    test('a built page beats the backend refusal — publish it and say which', () => {
        const artifactAt = deploySrc.indexOf('findBuiltArtifact');
        const backendMsgAt = deploySrc.indexOf('هذا نظام خلفي');
        expect(artifactAt).toBeGreaterThan(0);
        expect(backendMsgAt).toBeGreaterThan(artifactAt);
    });
    test('the "nothing to publish" message now tells the user the real next move', () => {
        expect(deploySrc).toMatch(/ابنِ صفحة أولاً ثم قل «انشر المشروع»/);
    });
    test('the report says WHAT was published (never implies the workspace when it was the page)', () => {
        expect(deploySrc).toMatch(/publishNoteAr/);
        expect(deploySrc).toMatch(/ما نُشر: /);
    });
});
