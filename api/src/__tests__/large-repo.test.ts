/**
 * Large-repo robustness (proposal ج): thousands of files must not freeze Joe on
 * a weak machine. Three bounds, guarded here:
 *   - the file tree caps one directory's fan-out (it stays lazy per level);
 *   - search opens at most a bounded number of files, even for a rare query;
 *   - connecting a repo clones shallow so a huge repo lands in seconds.
 */
import fs from 'fs';
import path from 'path';

const proj = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'routes', 'project.ts'), 'utf-8');
const gh = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'routes', 'github.ts'), 'utf-8');

describe('the file tree bounds a huge directory', () => {
    test('a per-directory cap with a hidden count is applied', () => {
        expect(proj).toMatch(/const DIR_CAP = 800/);
        expect(proj).toMatch(/shown >= DIR_CAP/);
        expect(proj).toMatch(/truncated: true, hiddenCount/);
    });
    test('the tree stays lazy per level (children fetched on expand)', () => {
        expect(proj).toMatch(/hasChildren: isDir/);
    });
});

describe('search is bounded so a rare query cannot walk the whole repo', () => {
    test('a file-scan budget caps how many files are opened', () => {
        expect(proj).toMatch(/const SEARCH_FILE_BUDGET = 4000/);
        expect(proj).toMatch(/searchScanned\.count >= SEARCH_FILE_BUDGET/);
        expect(proj).toMatch(/searchScanned\.count = 0; \/\/ reset/);
        expect(proj).toMatch(/partial: true/);
    });
    test('heavy dirs are always ignored', () => {
        expect(proj).toMatch(/'node_modules', '\.git', 'dist', 'build', '\.DS_Store', '\.next', 'coverage', 'vendor'/);
    });
    test('it still skips huge and binary files', () => {
        expect(proj).toMatch(/stat\.size > 1_000_000/);
        expect(proj).toMatch(/buf\.includes\(0\)/);
    });
});

describe('connecting a repo is light on a weak machine', () => {
    test('the clone is shallow and single-branch', () => {
        expect(gh).toMatch(/const shallow = \['--depth', '1', '--single-branch'\]/);
        expect(gh).toMatch(/\[\.\.\.shallow, url, '\.'\]/);
        expect(gh).toMatch(/\[\.\.\.shallow, url, repo\]/);
    });
});
