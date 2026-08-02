/**
 * The GitHub round-trip audit: connect a token → see ALL repos → connect to a
 * repo directly. Two real gaps were found and closed:
 *   1. /github/repos showed only OWNED repos, capped at 30 — org and
 *      collaborator repos, and anything past page 1, were invisible.
 *   2. Selecting a repo stored only its NAME; the working tree was never
 *      cloned, so Joe could analyse via API but never open/edit/build the
 *      real files. The connect endpoint now clones (or fetches) on connect.
 */
import fs from 'fs';
import path from 'path';

const ghRoute = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'routes', 'github.ts'), 'utf-8');
const sysTools = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'SystemTools.ts'), 'utf-8');
const ghService = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', 'services', 'githubService.ts'), 'utf-8');
const joePage = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', 'pages', 'Joe.tsx'), 'utf-8');

describe('listing shows ALL repositories, not just owned page 1', () => {
    test('affiliation widens to org + collaborator repos', () => {
        expect(ghRoute).toMatch(/affiliation=owner,collaborator,organization_member/);
        // The live query must not narrow to owned-only (a mention in a comment is fine).
        expect(ghRoute).not.toMatch(/\/user\/repos\?[^`'"]*type=owner/);
    });
    test('it paginates instead of truncating at 30', () => {
        expect(ghRoute).toMatch(/per_page=100/);
        expect(ghRoute).toMatch(/page=\$\{page\}/);
        expect(ghRoute).toMatch(/MAX_PAGES/);
        // last-page short-circuit so a small account makes one call, not ten.
        expect(ghRoute).toMatch(/batch\.length < 100/);
    });
    test('each repo carries its role so the UI can mark shared vs owned', () => {
        expect(ghRoute).toMatch(/role: r\.permissions\?\.admin \? 'admin'/);
    });
});

describe('connecting a repo brings its files down (not just a stored name)', () => {
    test('a dedicated connect endpoint exists and records the active repo', () => {
        expect(ghRoute).toMatch(/router\.post\('\/repos\/:owner\/:repo\/connect'/);
        expect(ghRoute).toMatch(/updateWorkspace\(userId, workspaceId, \{ activeRepo: fullName, kind: 'github' \}\)/);
    });
    test('it clones an empty workspace and fetches an existing checkout — idempotent', () => {
        expect(ghRoute).toMatch(/operation: 'clone'/);
        expect(ghRoute).toMatch(/operation: 'fetch'/);
        expect(ghRoute).toMatch(/hasGit/);
        // a non-empty workspace is cloned into a subdir, never clobbered.
        expect(ghRoute).toMatch(/cloned_subdir/);
    });
    test('the frontend actually calls connect-and-clone on selection', () => {
        expect(ghService).toMatch(/async connectRepo\(/);
        expect(ghService).toMatch(/\/github\/repos\/\$\{owner\}\/\$\{repo\}\/connect/);
        expect(joePage).toMatch(/githubService\.connectRepo\(workspaceId, repo\.fullName/);
        // name-only store remains as a fallback so selection never hard-fails.
        expect(joePage).toMatch(/githubService\.setActiveRepo\(workspaceId, repo\.fullName\)\.catch/);
    });
});

describe('credentials in a git URL never leak to the visible terminal/logs', () => {
    test('shell_execute redacts tokenized URLs and bare PATs', () => {
        expect(sysTools).toMatch(/https\?:\\\/\\\/\)\(\[\^:@\/\\s\]\+\):\(\[\^@\/\\s\]\+\)@/);
        expect(sysTools).toMatch(/gh\[pousr\]_\[A-Za-z0-9\]\{16,\}/);
    });
});
