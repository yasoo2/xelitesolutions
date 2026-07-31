/**
 * The workspace sandbox.
 *
 * This is the highest-value test in the suite, because the hole it covers was
 * real and shipped: resolveToolPath began with `if (path.isAbsolute(val)) return
 * val;`, which skipped the containment check at the bottom of the very same
 * function. A relative "../../../etc/passwd" was refused while an absolute
 * "/etc/passwd" was handed straight back — and ai_write_file used it to create
 * /etc/joe-owned.txt during a manual run.
 *
 * The header used to say "seven tool files depend on this function", which was
 * true and beside the point: SystemTools.ts, AnalysisTools.ts and ToolService.ts
 * each carried their OWN resolver of the same name, and all three had holes of
 * their own — so fixing this one left write_file, ls, file_edit, grep_search and
 * analyze_codebase still open. They were deleted and now call this. It is the
 * only containment rule in the system; if it regresses, everything fails.
 */

import path from 'path';
import { resolveToolPath, isWithinRoot } from '../modules/tools/utils';

/** Where the resolver anchors relative paths, discovered from the resolver itself. */
const anchor = path.dirname(resolveToolPath('probe-anchor.txt'));

/**
 * The OUTERMOST directory the resolver permits — the project root, derived the
 * same way it derives it (cwd truncated at the `api` segment). A sibling test
 * has to sit outside every allowed root, and the workspace anchor is nested
 * inside the project root, so `anchor + "-evil"` is legitimately allowed.
 */
const outermostAllowed = (() => {
    const parts = process.cwd().split(path.sep);
    const i = parts.indexOf('api');
    return i === -1 ? process.cwd() : (parts.slice(0, i).join(path.sep) || path.sep);
})();

describe('resolveToolPath containment', () => {
    describe('allows work inside the workspace', () => {
        it.each([
            ['a relative file', 'src/index.ts'],
            ['a dot-relative file', './data/x.json'],
            ['a nested relative path', 'a/b/c/d.txt'],
        ])('%s', (_label, input) => {
            const out = resolveToolPath(input);
            expect(path.isAbsolute(out)).toBe(true);
            expect(out.startsWith(anchor)).toBe(true);
        });

        it('an absolute path that is genuinely inside the anchor', () => {
            const inside = path.join(anchor, 'nested', 'file.txt');
            expect(resolveToolPath(inside)).toBe(inside);
        });
    });

    describe('refuses everything outside it', () => {
        it.each([
            ['an absolute system path', '/etc/passwd'],
            ['an absolute temp path', '/tmp/anything.txt'],
            ['a private key', '/root/.ssh/id_rsa'],
            ['traversal out of the workspace', '../../../../../../etc/shadow'],
            ['traversal disguised inside a path', 'src/../../../../../../etc/hosts'],
        ])('%s', (_label, input) => {
            expect(() => resolveToolPath(input)).toThrow(/path_outside_workspace/);
        });

        it('a sibling directory that merely shares a string prefix', () => {
            // `startsWith` alone accepted this: root "/srv/joe" admitted
            // "/srv/joe-backup/x" because the characters matched. The comparison
            // has to happen on a path boundary. Tested against the outermost
            // allowed root — a sibling of the inner workspace is still inside the
            // project and is supposed to be allowed.
            expect(() => resolveToolPath(outermostAllowed + '-evil/payload.txt')).toThrow(/path_outside_workspace/);
        });
    });

    describe('the specific regression that was found in production code', () => {
        it('does not hand back an absolute path unchecked', () => {
            // The exact call ai_write_file made when it wrote to /etc.
            expect(() => resolveToolPath('/etc/joe-owned.txt')).toThrow();
        });

        it('treats absolute and relative escapes identically', () => {
            const viaRelative = (() => { try { resolveToolPath('../../../../../../etc/passwd'); return 'allowed'; } catch { return 'refused'; } })();
            const viaAbsolute = (() => { try { resolveToolPath('/etc/passwd'); return 'allowed'; } catch { return 'refused'; } })();
            expect(viaAbsolute).toBe(viaRelative);
            expect(viaAbsolute).toBe('refused');
        });
    });

    it('handles empty and whitespace input without throwing something unexpected', () => {
        expect(path.isAbsolute(resolveToolPath(''))).toBe(true);
        expect(path.isAbsolute(resolveToolPath('   '))).toBe(true);
    });
});

describe('the containment rule on a case-insensitive filesystem', () => {
    /**
     * This suite runs on Linux, and the user runs Joe on Windows. `path.resolve`
     * keeps whatever case it was given, so a workspace at "C:\Users\home\..."
     * and a model-written "c:\users\home\..." are ONE directory that an exact
     * compare calls an escape. That is a false refusal on the platform this is
     * actually deployed to.
     *
     * `process.platform` is what the rule branches on, so it is what these
     * switch — the rule itself is real, and both branches of it are exercised.
     */
    const withPlatform = (value: string, fn: () => void) => {
        const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
        Object.defineProperty(process, 'platform', { value, configurable: true });
        try { fn(); } finally { Object.defineProperty(process, 'platform', original); }
    };

    it('accepts a path that differs only in case when running on Windows', () => {
        withPlatform('win32', () => {
            expect(isWithinRoot('/srv/joe/site/index.html', '/srv/Joe')).toBe(true);
            expect(isWithinRoot('/SRV/JOE', '/srv/joe')).toBe(true);
        });
    });

    it('still refuses a sibling prefix on Windows — folding case is not loosening the boundary', () => {
        withPlatform('win32', () => {
            expect(isWithinRoot('/srv/joe-backup/payload.txt', '/srv/Joe')).toBe(false);
            expect(isWithinRoot('/srv/JOE-EVIL/x', '/srv/joe')).toBe(false);
        });
    });

    it('keeps the exact comparison on Linux, where two cases are two files', () => {
        withPlatform('linux', () => {
            expect(isWithinRoot('/srv/joe/site', '/srv/Joe')).toBe(false);
            expect(isWithinRoot('/srv/joe/site', '/srv/joe')).toBe(true);
        });
    });

    it('treats the root itself as inside on both platforms', () => {
        for (const p of ['win32', 'linux']) {
            withPlatform(p, () => expect(isWithinRoot('/srv/joe', '/srv/joe')).toBe(true));
        }
    });
});
