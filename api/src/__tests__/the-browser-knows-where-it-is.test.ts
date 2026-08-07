/**
 * «لم يعجبني اداء المتصفح نهائيا انه بدائي وفاشل» — AND THE LOG PROVED IT.
 *
 * His «social media platform» build was graded 41/100 with six findings:
 * no <h1>, no <main>, no viewport meta, horizontal scroll at 390px, 4 console
 * errors, 0 controls pressed, 0 forms filled. Every one of them was true — of
 * EXPRESS'S 404 PAGE.
 *
 * The feed server had never served public/, so the interface that had just
 * been packaged into it was unreachable; «/» answered 404; and the auditor
 * walked into an error page and reviewed its typography for thirty seconds.
 *
 * Two defects, gated here and measured live in
 * verify_the_browser_finds_the_system.ts (22/22):
 *
 *   1. a feed system serves its own interface — the front door opens;
 *   2. the browser asks WHERE IT LANDED before it grades anything, says the
 *      truth about the system when the door is shut, invents nothing about a
 *      page nobody built, and recovers onto the real interface.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');
const API = () => read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
const AUDIT = () => read('core', 'quality', 'app-audit.ts');
const REACT = () => read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

describe('a server that carries an interface serves it — whatever kind of system it is', () => {
    it('the block exists once, and is not retyped per server', () => {
        const a = API();
        expect(a).toMatch(/const SERVE_PACKAGED_UI = `/);
        // Exactly two uses: the catalogue server and the feed server.
        expect((a.match(/\$\{SERVE_PACKAGED_UI\}/g) || []).length).toBe(2);
    });

    it('and it does what a single-page app needs: assets, then index.html', () => {
        const a = API();
        expect(a).toMatch(/app\.use\(express\.static\(PUBLIC, \{ index: false, maxAge: '1h' \}\)\);/);
        expect(a).toMatch(/if \(req\.method !== 'GET' \|\| req\.path\.startsWith\('\/api\/'\)\) return next\(\);/);
        expect(a).toMatch(/res\.sendFile\(path\.join\(PUBLIC, 'index\.html'\)\);/);
    });

    it('the feed server carries the imports that block needs — or it would not parse', () => {
        const feed = API().slice(API().indexOf('function filePostsServerJs'), API().indexOf('function fileDbJs'));
        expect(feed).toContain("import fs from 'node:fs';");
        expect(feed).toContain("import path from 'node:path';");
        expect(feed).toContain("import { fileURLToPath } from 'node:url';");
        expect(feed).toContain('const HERE_DIR = path.dirname(fileURLToPath(import.meta.url));');
        expect(feed).toContain('${SERVE_PACKAGED_UI}');
    });
});

describe('the browser asks where it landed before it grades anything', () => {
    it('it reads the landing response instead of assuming it arrived', () => {
        const a = AUDIT();
        expect(a).toMatch(/const landing = await page\.goto\(url, \{ waitUntil: 'networkidle', timeout: timeoutMs \}\);/);
        expect(a).toMatch(/const doorStatus = Number\(landing\?\.status\?\.\(\) \|\| 0\);/);
        expect(a).toMatch(/if \(doorStatus >= 400\) \{/);
    });

    it('a shut door is ONE honest finding about the system', () => {
        const a = AUDIT();
        expect(a).toMatch(/id: 'server_root_dead', severity: 'high'/);
        expect(a).toContain('الواجهة غير مخدومة من الخادم، فالنظام مغلق عند بابه');
        expect(a).toContain('The server runs but answered ${frontDoor.status} at "/"');
    });

    it('and it does not give up — it serves the built folder and measures the product', () => {
        const a = AUDIT();
        expect(a).toMatch(/frontDoor\.recovered = true;/);
        // What was counted while standing on the error page belonged to it.
        expect(a).toMatch(/consoleErrors\.length = 0;/);
        expect(a).toMatch(/failedRequests\.length = 0;/);
        expect(a).toMatch(/pageErrors\.length = 0;/);
    });

    it('and when it could NOT recover, every other finding is dropped', () => {
        const a = AUDIT();
        expect(a).toMatch(/if \(frontDoor && !frontDoor\.recovered\) \{/);
        expect(a).toMatch(/const door = findings\.filter\(f => f\.id === 'server_root_dead'\);/);
        expect(a).toMatch(/findings\.length = 0;/);
    });

    it('a page with no control and no form is that finding, not a typography review', () => {
        const a = AUDIT();
        expect(a).toMatch(/if \(!allControls\.length && !allForms\.length\) \{/);
        expect(a).toMatch(/id: 'empty_page', severity: 'high'/);
        expect(a).toContain('هذه ليست واجهة تطبيق');
    });

    it('and closing a server that never listened cannot take the process down', () => {
        expect(AUDIT()).toMatch(/srv\.close\(\(\) => \{ [^}]*\}\);/);
    });
});

describe('«listening» is not «serving»', () => {
    it('the builder knocks on the front door before handing the address to the audit', () => {
        const r = REACT();
        expect(r).toMatch(/const url = `http:\/\/127\.0\.0\.1:\$\{port\}\/`;/);
        expect(r).toMatch(/door = \(await fetch\(url, \{ redirect: 'follow' \}\)\)\.status;/);
        expect(r).toMatch(/if \(door !== 200\) \{/);
    });

    it('and when the door is shut it says so and audits the folder instead', () => {
        const r = REACT();
        expect(r).toContain('it serves no interface, so the audit measures the built folder instead');
        // The server it started is not left running behind a failed check.
        expect(r).toMatch(/if \(door !== 200\) \{[\s\S]{0,400}?child\.kill\(\)/);
    });
});
