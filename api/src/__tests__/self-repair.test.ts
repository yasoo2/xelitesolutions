/**
 * A BUILD THAT MENDS ITSELF BEFORE IT IS HANDED OVER.
 *
 * The React path measured its output and delivered it exactly as measured —
 * «self-QA: 62/100 — dead_links, small_targets» — with the repair machinery
 * one function away, reachable only if the user knew to say «أصلح الواجهة».
 *
 * The properties held here are the ones that make an automatic repair safe
 * enough to run unattended on somebody's project:
 *   • nothing is written that does not parse
 *   • nothing survives a failed rebuild
 *   • nothing is rebuilt when there is nothing this code can fix
 *   • and the second score is MEASURED, never assumed
 */
import fs from 'fs';
import path from 'path';
import { worthRepairing, REPAIRABLE_FINDINGS, collectSources } from '../core/quality/self-repair';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('the repair cycle is one piece of code', () => {
    it('the build path and the fix tool call the same function', () => {
        expect(read('modules', 'tools', 'definitions', 'ReactProjectTool.ts')).toMatch(/await repairAndRebuild\(proj/);
        expect(read('modules', 'tools', 'definitions', 'UiFixTool.ts')).toMatch(/await repairAndRebuild\(dir/);
    });

    it('and the tool no longer carries its own copy of it', () => {
        const U = read('modules', 'tools', 'definitions', 'UiFixTool.ts');
        expect(U).not.toMatch(/function collectSources/);
        expect(U).not.toMatch(/const gate = syntaxOk\(rel, text\)/);
    });

    it('every write passes the syntax gate first, and a failed build reverts all', () => {
        const S = read('core', 'quality', 'self-repair.ts');
        expect(S).toMatch(/const gate = syntaxOk\(rel, text\)/);
        expect(S).toMatch(/if \(!gate\.ok\) \{ refused\.push/);
        expect(S).toMatch(/for \(const rel of changed\) \{[\s\S]*?fs\.writeFileSync\(path\.join\(dir, rel\), sources\[rel\]/);
        expect(S).toMatch(/reverted: true/);
    });
});

describe('a rebuild is only spent on something this code can actually fix', () => {
    it('repairable findings trigger it', () => {
        expect(worthRepairing([{ id: 'console_errors' }, { id: 'small_targets' }])).toBe(true);
        expect(worthRepairing([{ id: 'keyboard_unreachable' }])).toBe(true);
    });

    it('and findings no deterministic edit can answer do not', () => {
        expect(worthRepairing([{ id: 'console_errors' }, { id: 'dead_controls' }, { id: 'webfont_missing' }])).toBe(false);
        expect(worthRepairing([])).toBe(false);
    });

    it('the list does not promise repairs that do not exist', () => {
        const repairs = read('core', 'quality', 'ui-repair.ts');
        for (const id of ['dead_links', 'small_targets', 'h1_count', 'keyboard_unreachable', 'heavy_images']) {
            expect(REPAIRABLE_FINDINGS.has(id)).toBe(true);
            expect(repairs).toContain(`'${id}'`);
        }
        // Things a machine cannot decide must never be on this list.
        for (const id of ['dead_controls', 'console_errors', 'page_errors', 'webfont_missing', 'broken_routes']) {
            expect(REPAIRABLE_FINDINGS.has(id)).toBe(false);
        }
    });
});

describe('the build only claims an improvement it measured', () => {
    const R = () => read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

    it('re-audits after repairing instead of assuming', () => {
        expect(R()).toMatch(/const after = await auditBuiltApp\(path\.join\(proj, 'dist'\)/);
        expect(R()).toMatch(/if \(!after\.skipped && after\.score >= audit\.score\)/);
    });

    it('and keeps the first verdict when the repair did not help', () => {
        expect(R()).toMatch(/no measured gain — keeping the original verdict/);
    });

    it('the delivery message prints both numbers, not a promise', () => {
        expect(R()).toMatch(/\$\{selfRepair\.before\}\/100 ← \$\{selfRepair\.after\}\/100/);
    });
});

describe('source collection', () => {
    it('reads the files a UI repair can touch and skips the ones it must not', () => {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'joe-collect-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), 'export default () => null;');
        fs.writeFileSync(path.join(dir, 'src', 'app.css'), 'body{}');
        fs.writeFileSync(path.join(dir, 'src', 'data.json'), '{}');
        fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'a.jsx'), 'x');
        fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<html></html>');

        const out = collectSources(dir);
        expect(Object.keys(out).sort()).toEqual(['index.html', 'src/App.jsx', 'src/app.css']);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
