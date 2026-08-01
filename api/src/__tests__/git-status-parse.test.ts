/**
 * /git/status used to spawn FOUR git commands per refresh (rev-parse, status,
 * branch --show-current, rev-list --count) — on the Windows laptop each spawn
 * costs real seconds, and the frontend polls the endpoint on a timer. One
 * command now answers everything: `git status --porcelain --branch`. This
 * suite feeds the parser every header shape git actually emits, so collapsing
 * four commands into one loses no information.
 */
import { parseStatusPorcelainBranch } from '../core/git/parse-status';
import * as fs from 'fs';
import * as path from 'path';

describe('parseStatusPorcelainBranch', () => {
    it('reads branch, ahead/behind, and files from one command output', () => {
        const out = [
            '## main...origin/main [ahead 2, behind 1]',
            ' M web/src/pages/Joe.tsx',
            'A  api/src/core/git/parse-status.ts',
            '?? notes.txt',
        ].join('\n');
        const snap = parseStatusPorcelainBranch(out);
        expect(snap.branch).toBe('main');
        expect(snap.ahead).toBe(2);
        expect(snap.behind).toBe(1);
        expect(snap.files).toEqual([
            { status: ' M', file: 'web/src/pages/Joe.tsx' },
            { status: 'A ', file: 'api/src/core/git/parse-status.ts' },
            { status: '??', file: 'notes.txt' },
        ]);
    });

    it('ahead only — behind defaults to zero', () => {
        const snap = parseStatusPorcelainBranch('## main...origin/main [ahead 3]\n');
        expect(snap.ahead).toBe(3);
        expect(snap.behind).toBe(0);
    });

    it('no upstream — plain branch header, zero ahead/behind', () => {
        const snap = parseStatusPorcelainBranch('## feature/new-thing\n M a.ts');
        expect(snap.branch).toBe('feature/new-thing');
        expect(snap.ahead).toBe(0);
        expect(snap.behind).toBe(0);
        expect(snap.files).toHaveLength(1);
    });

    it('detached HEAD reports an empty branch — exactly what `branch --show-current` returned', () => {
        const snap = parseStatusPorcelainBranch('## HEAD (no branch)\n M a.ts');
        expect(snap.branch).toBe('');
    });

    it('a repository with no commits yet still names its branch', () => {
        const snap = parseStatusPorcelainBranch('## No commits yet on main\n?? first.txt');
        expect(snap.branch).toBe('main');
        expect(snap.files).toEqual([{ status: '??', file: 'first.txt' }]);
    });

    it('renames keep the old "from -> to" shape the UI already understands', () => {
        const snap = parseStatusPorcelainBranch('## main\nR  old-name.ts -> new-name.ts');
        expect(snap.files).toEqual([{ status: 'R ', file: 'old-name.ts -> new-name.ts' }]);
    });

    it('a clean tree is a header and nothing else', () => {
        const snap = parseStatusPorcelainBranch('## main...origin/main\n');
        expect(snap.files).toEqual([]);
    });

    it('empty output crashes nothing', () => {
        expect(parseStatusPorcelainBranch('')).toEqual({ branch: '', ahead: 0, behind: 0, files: [] });
    });
});

describe('the route really dropped the extra spawns', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'api', 'routes', 'git.ts'),
        'utf-8'
    );

    it('/git/status runs the single combined command', () => {
        expect(src).toMatch(/'status', '--porcelain', '--branch'/);
    });

    it('the rev-parse pre-flight, branch --show-current, and rev-list spawns are gone', () => {
        // Match actual command spawns (gitExec argument lists), not the words
        // in comments explaining what was removed.
        expect(src).not.toMatch(/gitExec\(\['rev-parse'/);
        expect(src).not.toMatch(/gitExec\(\['branch'/);
        expect(src).not.toMatch(/gitExec\(\['rev-list'/);
    });
});
