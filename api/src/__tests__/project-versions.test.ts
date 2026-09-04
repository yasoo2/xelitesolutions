/**
 * A PROJECT CAN BE PUT BACK.
 *
 * Pages have had instant rollback for a long time; React projects never did.
 * Joe edits them surgically, repairs their source before delivery, and mends
 * what its own audit measures — and the only existing safety net undoes a
 * change that failed to BUILD. The ordinary case is a change that built
 * perfectly and that he simply did not want.
 *
 * The properties gated here are the ones that make history trustworthy: it
 * holds source only, it restores exactly, it removes what was added after, it
 * cannot itself be edited by the repairers, and it is bounded so a long session
 * cannot fill a disk.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { snapshotProject, listVersions, restoreVersion, sourceFiles, VERSIONS_DIR } from '../core/project/versions';

function tinyProject(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-ver-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"p"}');
    fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), 'export default () => "one";\n');
    fs.writeFileSync(path.join(dir, 'src', 'app.css'), 'body{color:#111}\n');
    fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'big.js'), 'x'.repeat(1000));
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<html></html>');
    return dir;
}

describe('what a snapshot holds', () => {
    it('is source, and nothing that can be rebuilt', () => {
        const dir = tinyProject();
        const files = sourceFiles(dir);
        expect(files).toContain('src/App.jsx');
        expect(files).toContain('package.json');
        expect(files.some(f => f.startsWith('node_modules'))).toBe(false);
        expect(files.some(f => f.startsWith('dist'))).toBe(false);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('and never itself — history does not nest', () => {
        const dir = tinyProject();
        snapshotProject(dir, 'first');
        expect(sourceFiles(dir).some(f => f.startsWith(VERSIONS_DIR))).toBe(false);
        snapshotProject(dir, 'second');
        expect(listVersions(dir).length).toBe(2);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('a folder that is not a project produces nothing, and does not throw', () => {
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-none-'));
        expect(snapshotProject(empty, 'x')).toBeNull();
        expect(listVersions(empty)).toEqual([]);
        fs.rmSync(empty, { recursive: true, force: true });
    });
});

describe('restoring', () => {
    it('puts every file back byte-for-byte', () => {
        const dir = tinyProject();
        const before = fs.readFileSync(path.join(dir, 'src', 'App.jsx'), 'utf-8');
        snapshotProject(dir, 'before the change');
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), 'export default () => "two";\n');
        const r = restoreVersion(dir);
        expect(r.ok).toBe(true);
        expect(fs.readFileSync(path.join(dir, 'src', 'App.jsx'), 'utf-8')).toBe(before);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('restores build configuration exactly when a repair accidentally removes it', () => {
        const dir = tinyProject();
        const config = "import { defineConfig } from 'vite';\nexport default defineConfig({ base: './' });\n";
        fs.writeFileSync(path.join(dir, 'vite.config.js'), config);
        const snapshot = snapshotProject(dir, 'before UI repair');
        expect(snapshot?.id).toBeTruthy();

        fs.rmSync(path.join(dir, 'vite.config.js'));
        fs.writeFileSync(path.join(dir, 'src', 'app.css'), 'body{color:#f00}\n');

        const r = restoreVersion(dir, snapshot?.id);
        expect(r.ok).toBe(true);
        expect(r.error).toBeUndefined();
        expect(fs.readFileSync(path.join(dir, 'vite.config.js'), 'utf-8')).toBe(config);
        expect(fs.readFileSync(path.join(dir, 'src', 'app.css'), 'utf-8')).toBe('body{color:#111}\n');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('removes what was added after it — a restore is not a merge', () => {
        const dir = tinyProject();
        snapshotProject(dir, 'clean');
        fs.writeFileSync(path.join(dir, 'src', 'Extra.jsx'), 'export default () => null;\n');
        const r = restoreVersion(dir);
        expect(r.ok).toBe(true);
        expect(r.removed).toContain('src/Extra.jsx');
        expect(fs.existsSync(path.join(dir, 'src', 'Extra.jsx'))).toBe(false);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('takes a snapshot of the present first, so undo is undoable', () => {
        const dir = tinyProject();
        snapshotProject(dir, 'v1');
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), 'export default () => "two";\n');
        const r = restoreVersion(dir);
        expect(r.undoOf).toBeTruthy();
        expect(listVersions(dir).length).toBe(2);
        expect(listVersions(dir)[0].label).toMatch(/قبل الاسترجاع/);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('says so plainly when there is nothing to go back to', () => {
        const dir = tinyProject();
        expect(restoreVersion(dir)).toMatchObject({ ok: false, error: 'no_versions' });
        expect(restoreVersion(dir, 'made-up-id')).toMatchObject({ ok: false });
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('history is bounded, and read-only to the repairers', () => {
    it('keeps the newest ten and prunes the rest', () => {
        const dir = tinyProject();
        for (let i = 0; i < 13; i++) snapshotProject(dir, `v${i}`);
        const all = listVersions(dir);
        expect(all.length).toBe(10);
        expect(all[0].label).toBe('v12');          // newest first
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('the source collectors cannot see into it', () => {
        const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
        // Repairing a snapshot would rewrite the past a restore hands back.
        expect(read('core', 'quality', 'self-repair.ts')).toMatch(/'\.joe-versions'/);
        expect(read('modules', 'tools', 'definitions', 'ProjectEditTool.ts')).toMatch(/'\.joe-versions'/);
    });
});

describe('every mutation leaves a way back', () => {
    const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

    it('the self-repair cycle snapshots before it writes', () => {
        expect(read('core', 'quality', 'self-repair.ts')).toMatch(/snapshotProject\(dir, 'قبل الإصلاح الذاتي'\)/);
    });

    it('and so does the surgical editor', () => {
        expect(read('modules', 'tools', 'definitions', 'ProjectEditTool.ts')).toMatch(/snapshotProject\(dir, 'قبل التعديل'\)/);
    });

    it('«تراجع» with an active project reaches the project tool, not the page tool', () => {
        const P = read('core', 'orchestrator', 'PlanningEngine.ts');
        expect(P).toMatch(/tool: 'project_undo'/);
        expect(P).toMatch(/\(undoVerb \|\| listVerb\) && active\?\.dir/);
    });
});
