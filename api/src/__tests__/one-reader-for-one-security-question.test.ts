/**
 *  ONE READER FOR ONE SECURITY QUESTION.
 *
 *  Three functions in this repository were called isWithinRoot — the same
 *  name, the same two arguments, three files. Measured on win32, the
 *  owner's own platform, they disagreed on three of seven cases:
 *
 *      drive letter lowered   utils=true   others=false
 *      whole path lowered     utils=true   others=false
 *      «…\\xelitesolutions\\..\\secrets»   utils=TRUE   others=false
 *
 *  The first two are false REFUSALS of legitimate writes — the exact case
 *  utils' own comment was written to prevent, because Windows filesystems
 *  ignore case and path.resolve preserves whatever case it was handed.
 *
 *  The third is a false ACCEPT. An unresolved string that begins with the
 *  parent and then climbs out of it is still, character for character,
 *  inside the parent. A path escapes by what it MEANS, not by how it is
 *  spelled.
 *
 *  Neither of the three was right, and that is the point: nobody was wrong
 *  on purpose. Resolving answers the escape, folding answers the refusal,
 *  and the two are independent — so a copy with one and not the other was
 *  going to be wrong somewhere, and each was wrong somewhere different.
 */
import * as fs from 'fs';
import * as path from 'path';
import { isWithinRoot } from '../modules/tools/utils';

const ROOT = 'C:\\Users\\home\\Documents\\xelitesolutions';
const PROJECTS = ROOT + '\\data\\projects';
const win = process.platform === 'win32';

/**
 *  ⛔ A FIXTURE WRITTEN IN ONE PLATFORM'S DIALECT, JUDGED BY THE OTHER'S PARSER.
 *
 *  Every case below used to run on both platforms with Windows-form paths,
 *  and one of them was simply WRONG on Linux:
 *
 *      isWithinRoot(PROJECTS + '\\x', PROJECTS)      win32 = true
 *                                                     POSIX = false
 *
 *  Both answers are correct. On win32 the backslash is a SEPARATOR, so that
 *  string names a child. On POSIX it is an ordinary FILENAME CHARACTER, so
 *  the string names an entry sitting BESIDE the root, called `projects\\x`.
 *
 *  ⛔ AND THE POSIX ANSWER IS A SECURITY PROPERTY, NOT AN INCONVENIENCE.
 *  Teaching the primitive to answer `true` there would be a false ACCEPT on
 *  a containment check — a path outside the root judged inside it, which is
 *  exactly what path-containment.ts was written to kill. So the primitive is
 *  untouched and the FIXTURE is what gets a dialect.
 *
 *  The class: the same string means two different things to two readers, and
 *  the test asserted one reader's meaning as if it were universal. Sibling of
 *  `a-requirement-read-in-one-inflection-and-named-in-one-language`.
 *
 *  ⛔ AND SPLITTING IS NOT SKIPPING. A criterion that only ever runs on one
 *  platform is, on the other, a criterion that can never fail. So the five
 *  claims are asserted TWICE — once in each dialect — and the disagreement
 *  itself is asserted third, in both directions.
 */

const onWin = win ? it : it.skip;
const onPosix = win ? it.skip : it;

const P_ROOT = '/srv/joe';
const P_PROJECTS = P_ROOT + '/data/projects';

describe('a path escapes by what it means, not by how it is spelled — Windows dialect', () => {
    onWin('«..» does not stay inside by starting inside', () => {
        expect(isWithinRoot(ROOT + '\\..\\secrets', ROOT)).toBe(false);
    });

    onWin('a sibling that shares a prefix is not a child', () => {
        expect(isWithinRoot(ROOT + '-backup\\x', ROOT)).toBe(false);
    });

    onWin('somewhere else entirely is not a child', () => {
        expect(isWithinRoot('C:\\Windows\\System32', ROOT)).toBe(false);
    });

    onWin('a real child is a child', () => {
        expect(isWithinRoot(PROJECTS + '\\x', PROJECTS)).toBe(true);
    });

    onWin('the root is within itself', () => {
        expect(isWithinRoot(ROOT, ROOT)).toBe(true);
    });
});

describe('…and the same five claims in the POSIX dialect', () => {
    //  Not a translation for tidiness. Without these, the whole block above
    //  is dead weight on Linux and the gate that runs there proves nothing
    //  about containment at all.
    onPosix('«..» does not stay inside by starting inside', () => {
        expect(isWithinRoot(P_ROOT + '/../secrets', P_ROOT)).toBe(false);
    });

    onPosix('a sibling that shares a prefix is not a child', () => {
        expect(isWithinRoot(P_ROOT + '-backup/x', P_ROOT)).toBe(false);
    });

    onPosix('somewhere else entirely is not a child', () => {
        expect(isWithinRoot('/etc/shadow', P_ROOT)).toBe(false);
    });

    onPosix('a real child is a child', () => {
        expect(isWithinRoot(P_PROJECTS + '/x', P_PROJECTS)).toBe(true);
    });

    onPosix('the root is within itself', () => {
        expect(isWithinRoot(P_ROOT, P_ROOT)).toBe(true);
    });
});

describe('and a dialect is never universal — asserted in BOTH directions', () => {
    //  This is the case that failed the gate. It is kept, not deleted: the
    //  disagreement is the point, and each platform's answer is pinned so a
    //  future «fix» that loosens the primitive turns one of them red.
    onWin('on Windows a backslash SEPARATES, so that string is a child', () => {
        expect(isWithinRoot(PROJECTS + '\\x', PROJECTS)).toBe(true);
    });

    onPosix('on POSIX a backslash is a FILENAME character, so it is refused', () => {
        //  `projects\\x` sits beside the root, not inside it. Answering true
        //  here would be a false accept on a security boundary.
        expect(isWithinRoot(P_PROJECTS + '\\x', P_PROJECTS)).toBe(false);
    });

    onPosix('and a whole Windows path is not a POSIX child either', () => {
        expect(isWithinRoot(ROOT + '\\data', P_ROOT)).toBe(false);
    });
});

describe('…and on Windows the case belongs to the filesystem, not the caller', () => {
    const only = win ? it : it.skip;

    only('a lowercase drive letter is the same drive', () => {
        expect(isWithinRoot('c:' + PROJECTS.slice(2) + '\\x', PROJECTS)).toBe(true);
    });

    only('a wholly lowercased path is the same path', () => {
        expect(isWithinRoot(PROJECTS.toLowerCase() + '\\x', PROJECTS)).toBe(true);
    });

    only('and folding never turns an escape into a child', () => {
        expect(isWithinRoot((ROOT + '-BACKUP\\x').toLowerCase(), ROOT)).toBe(false);
        expect(isWithinRoot((ROOT + '\\..\\SECRETS').toLowerCase(), ROOT)).toBe(false);
    });
});

describe('and there is exactly one of it — by what it ASKS, not what it is called', () => {
    /**
     *  THIS GUARD FELL INTO THE CLASS IT WAS WRITTEN TO CLOSE.
     *
     *  Its first version searched for the NAME `isWithinRoot`. A FOURTH
     *  copy — `isWithin` in workspace-evidence.ts, one letter shorter, the
     *  same question, resolving without folding — walked straight past it.
     *
     *  A guard on a spelling protects the case it knows and not the case
     *  that matters. So the test is the SHAPE of the answer: a body that
     *  decides containment with `startsWith` and a path separator. That is
     *  what all four copies had in common, and what a fifth would have.
     */
    //  A containment question needs BOTH a child and a parent. `startsWith(path.sep)`
    //  asks something else entirely — whether a string is absolute — so the pattern
    //  demands a parent be joined to the separator, by `+` or by a template.
    const CONTAINMENT = new RegExp('startsWith\\((?:[^)]*\\+ *path\\.sep|`[^`]*\\$\\{path\\.sep\\})');

    it('no file outside utils answers «is this path inside that root?»', () => {
        const root = path.join(__dirname, '..');
        const guilty: string[] = [];
        const walk = (dir: string) => {
            for (const name of fs.readdirSync(dir)) {
                if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
                const full = path.join(dir, name);
                if (fs.statSync(full).isDirectory()) { walk(full); continue; }
                if (!name.endsWith('.ts')) continue;
                const rel = full.slice(root.length + 1);
                if (rel === path.join('modules', 'tools', 'path-containment.ts')) continue;
                if (CONTAINMENT.test(fs.readFileSync(full, 'utf8'))) guilty.push(rel);
            }
        };
        walk(root);
        //  ONE file may still answer a containment question inline, because
        //  it is asking a DIFFERENT question: isSafeRepoPath() is handed a
        //  relative string with no root at all, and asks whether that string
        //  climbs upward on its own. There is no parent to be inside of.
        //  Everything else in this tree now calls path-containment.ts.
        const known = [path.join('api', 'routes', 'git.ts')];
        expect(guilty.filter(f => !known.includes(f))).toEqual([]);
    });
});
