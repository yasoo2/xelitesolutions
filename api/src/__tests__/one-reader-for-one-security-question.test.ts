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

describe('a path escapes by what it means, not by how it is spelled', () => {
    it('«..» does not stay inside by starting inside', () => {
        expect(isWithinRoot(ROOT + '\\..\\secrets', ROOT)).toBe(false);
    });

    it('a sibling that shares a prefix is not a child', () => {
        expect(isWithinRoot(ROOT + '-backup\\x', ROOT)).toBe(false);
    });

    it('somewhere else entirely is not a child', () => {
        expect(isWithinRoot('C:\\Windows\\System32', ROOT)).toBe(false);
    });

    it('a real child is a child', () => {
        expect(isWithinRoot(PROJECTS + '\\x', PROJECTS)).toBe(true);
    });

    it('the root is within itself', () => {
        expect(isWithinRoot(ROOT, ROOT)).toBe(true);
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

describe('and there is exactly one of it', () => {
    it('no file declares a second isWithinRoot', () => {
        //  The property, not the spelling: three copies of one security
        //  answer is how they come apart, and they had.
        const root = path.join(__dirname, '..');
        const found: string[] = [];
        const walk = (dir: string) => {
            for (const name of fs.readdirSync(dir)) {
                if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
                const full = path.join(dir, name);
                if (fs.statSync(full).isDirectory()) { walk(full); continue; }
                if (!name.endsWith('.ts')) continue;
                if (new RegExp('function\\s+isWithinRoot\\s*\\(').test(fs.readFileSync(full, 'utf8'))) found.push(full.slice(root.length + 1));
            }
        };
        walk(root);
        expect(found).toEqual([path.join('modules', 'tools', 'utils.ts')]);
    });
});
