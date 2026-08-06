/**
 * «⛔ Delivered, but it does NOT work properly — 2 blocking finding(s) remain»
 *
 * Both were one request: a 404 on `/api/health`, twice counted (once as a
 * console error, once as a failed request). The app asks its own origin one
 * question at startup — «do you serve my API?» — and the audit was serving a
 * FOLDER, which cannot answer. The build had already packaged that interface
 * INSIDE its API server, where the question answers itself and the catalogue
 * comes from the real database; the audit never went there.
 *
 * Measured live (verify_audit_measures_the_system.ts): 67/100 with two false
 * blockers → 97/100 clean, on the running system.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('the audit measures the system, not the folder', () => {
    it('it can be pointed at a running address instead of serving a dist', () => {
        const a = read('core', 'quality', 'app-audit.ts');
        expect(a).toMatch(/serveUrl\?: string;/);
        expect(a).toMatch(/const givenUrl = String\(opts\?\.serveUrl \|\| ''\)\.trim\(\);/);
        // The throwaway static server must not even listen when there is a real one.
        expect(a).toMatch(/if \(!givenUrl\) await new Promise<void>\(r => srv\.listen\(0, '127\.0\.0\.1', \(\) => r\(\)\)\);/);
        expect(a).toMatch(/const url = givenUrl \|\| `http:\/\/127\.0\.0\.1:\$\{\(srv\.address\(\) as any\)\.port\}\/`;/);
    });

    it('and a folder is never blamed for not answering the app’s API probe', () => {
        const a = read('core', 'quality', 'app-audit.ts');
        // Suppressed ONLY when we served the folder ourselves…
        expect(a).toMatch(/if \(!givenUrl && \/\\\/api\\\/health\/\.test\(String\(m\.text\(\)\) \+ where\)\) return;/);
        expect(a).toMatch(/&& !\(!givenUrl && \/\\\/api\\\/health\/\.test\(r\.url\(\)\)\)\) failedRequests\.push/);
        // …so on the real system the same 404 still counts, as it must.
        expect(a).toMatch(/there it means the API really is missing/);
    });
});

describe('the build audits the system it just packaged', () => {
    const R = () => read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

    it('packaging is reusable, because the repair rebuilds the interface', () => {
        const r = R();
        expect(r).toMatch(/const packageIntoApi = \(announce: boolean\) => \{/);
        expect(r).toMatch(/const packaged = built \? packageIntoApi\(true\) : false;/);
        // After a repair the packaged copy is the OLD build until this runs.
        expect(r).toMatch(/if \(packaged\) packageIntoApi\(false\);/);
        expect(r.indexOf('if (packaged) packageIntoApi(false);')).toBeLessThan(r.indexOf('const after = await auditBuiltApp'));
    });

    it('the packaged server is started for the measurement and stopped after it', () => {
        const r = R();
        expect(r).toMatch(/const bootPackagedServer = async \(\): Promise<typeof liveServer> => \{/);
        // Never boot a server whose dependencies were never installed.
        expect(r).toMatch(/if \(!packaged \|\| !apiDir \|\| !fs\.existsSync\(path\.join\(apiDir, 'node_modules'\)\)\) return null;/);
        expect(r).toMatch(/if \(\/listening on\/\.test\(l\)\) up\(true\);/);
        expect(r).toMatch(/liveServer\.stop\(\);/);
        expect(r).toMatch(/stopped the server that was started for the measurement/);
    });

    it('and both audits — before and after the repair — use that address', () => {
        const r = R();
        expect((r.match(/\.\.\.\(liveServer \? \{ serveUrl: liveServer\.url \} : \{\}\),/g) || []).length).toBe(2);
    });

    it('a build with no server of its own still gets audited', () => {
        const r = R();
        // bootPackagedServer returns null in that case, and the spread adds nothing.
        expect(r).toMatch(/liveServer = await bootPackagedServer\(\);/);
        expect(r).toMatch(/if \(liveServer\) \{\s*\n\s*term\(`self-QA: measuring the RUNNING system/);
    });
});
