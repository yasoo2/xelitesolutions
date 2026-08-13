/**
 * THE SECOND OUTSIDE REPORT — CHECKED THE SAME WAY AS THE FIRST.
 *
 * A follow-up audit ran the three previous batches and a wide Arabic prompt
 * through Joe. Three of its operational findings were reproducible here and
 * are fixed; one of its recommendations was measured and turned out to be
 * wrong, which is worth pinning too so nobody "fixes" it later on the strength
 * of the advisory alone.
 *
 *   ✔ `npm run go-live-check` could not run from a clean install: the script
 *     calls `npx tsx` and tsx was in neither dependencies nor devDependencies,
 *     so npx offered to download it interactively. A readiness guard that
 *     cannot start is not a guard.
 *
 *   ✔ An operator had no supported way to tell Joe where builds should land.
 *     The workspace root is a saved choice or a default; a sentence in a
 *     prompt is not a setting, and a sandbox that says «write only here»
 *     deserves a switch rather than a hope.
 *
 *   ✘ «Upgrade pm2 to clear the js-yaml high.» Installed and measured on this
 *     exact tree: pm2 7.0.3 leaves js-yaml exactly where it was and adds a
 *     high of its own. The recommendation is wrong for this tree, and the CI
 *     gate carries the numbers so the next reader does not repeat it.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf-8');
const CI = read('.github', 'workflows', 'ci.yml');
const WS = read('api', 'src', 'modules', 'services', 'WorkspaceService.ts');
const PKG = JSON.parse(read('api', 'package.json'));

describe('a readiness check that can actually start', () => {
    it('tsx is declared, so `npm ci` is enough to run it', () => {
        expect(PKG.devDependencies?.tsx || PKG.dependencies?.tsx).toBeTruthy();
    });

    it('…and the script that needs it is still the one wired up', () => {
        expect(PKG.scripts['go-live-check']).toContain('tsx');
    });

    /**
     * Every manual proof in this repo is run with tsx. They were all one
     * interactive npx prompt away from not running on a clean machine.
     */
    it('and every tsx-driven script is covered by that one declaration', () => {
        const usesTsx = Object.values(PKG.scripts as Record<string, string>)
            .filter(v => /\btsx\b/.test(v));
        expect(usesTsx.length).toBeGreaterThan(0);
        expect(PKG.devDependencies?.tsx).toMatch(/^\^?4\./);
    });
});

describe('an operator can pin where builds land', () => {
    it('JOE_WORKSPACE_ROOT wins over the saved choice and the default', () => {
        expect(WS).toMatch(/const pinned = String\(process\.env\.JOE_WORKSPACE_ROOT \|\| ''\)\.trim\(\);/);
        expect(WS).toMatch(/this\._localRoot = pinned;/);
    });

    it('…and it is read BEFORE the saved choice, or it would not win at all', () => {
        const pin = WS.indexOf('JOE_WORKSPACE_ROOT');
        const saved = WS.indexOf('this.localRootFile');
        expect(pin).toBeGreaterThan(-1);
        expect(pin).toBeLessThan(WS.indexOf('const saved = JSON.parse'));
        expect(saved).toBeGreaterThan(-1);
    });

    it('a root that cannot be created falls back instead of killing the run', () => {
        expect(WS).toMatch(/could not be used \(\$\{e\?\.message\}\) — falling back/);
    });
});

describe('a recommendation that was measured before it was believed', () => {
    it('the audit gate carries the numbers that decided it', () => {
        expect(CI).toMatch(/pm2 6\.0\.14\s+→\s+1 high/);
        expect(CI).toMatch(/pm2 7\.0\.3\s+→\s+2 high/);
        expect(CI).toMatch(/audit-level=critical/);
    });

    it('and pm2 stays on the major that measured better', () => {
        expect(PKG.dependencies.pm2).toMatch(/\^6\./);
    });

    /**
     * The threshold is the only thing being argued. The real number is printed
     * on every run, unfiltered, so «we block at critical» can never quietly
     * become «we do not look».
     */
    it('the unfiltered audit still runs, so nothing is hidden', () => {
        expect(CI).toMatch(/npm --prefix api audit --omit=dev \|\| true/);
        expect(CI).toMatch(/npm --prefix web audit \|\| true/);
    });
});
