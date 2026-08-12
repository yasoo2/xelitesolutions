/**
 * «ما زلت لم ارى شاشة الثيرمال يفتح مثل شاشة المتصفح ويجري اختبارات امامي …
 *  ويرى جو نتائج الاختبارات التي يجريها الثيرمال مثل ما ياخذ نتائج الجودة
 *  التي يجريها المتصفح»
 *
 * A real asymmetry. The browser half opened its own panel, pressed every
 * control in front of him, and returned a score with named findings Joe
 * repaired against and reported. The terminal half was a PIPE: output
 * scrolled past, the panel never opened, and nothing there was ever measured.
 *
 * A stream is not a test, and output nobody scores is not a result.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { auditInTerminal, failingIds } from '../core/quality/terminal-audit';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const REACT = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
const REPAIR = read('core', 'quality', 'self-repair.ts');

describe('the terminal has its own instrument, not just a pipe', () => {
    it('the build asks for the TERMINAL panel by name, exactly as it does the browser', () => {
        expect(REACT).toMatch(/panel_focus[\s\S]{0,140}panel: 'terminal', reason: 'terminal_qa'/);
        // …and the browser's own focus is still there — this adds, never replaces.
        expect(REACT).toMatch(/panel: 'browser', reason: 'self_qa'/);
    });

    it('it runs against the SERVER directory, with the live system and the declared tables', () => {
        expect(REACT).toMatch(/auditInTerminal\(apiDir, \{/);
        expect(REACT).toMatch(/serveUrl: liveServer \? liveServer\.url : '',/);
        expect(REACT).toMatch(/tables: systemTables,/);
    });

    it('Joe says the number out loud, the way he says the browser\'s', () => {
        expect(REACT).toMatch(/terminal-QA: \$\{terminalAudit\.score\}\/100/);
        expect(REACT).toMatch(/⌨️ فحص الطرفية: \$\{terminalAudit\.score\}\/100/);
        expect(REACT).toMatch(/⌨️ Terminal QA: \$\{terminalAudit\.score\}\/100/);
    });

    it('and it lands in the delivery message beside the browser score, check by check', () => {
        expect(REACT).toMatch(/Terminal QA: \*\*\$\{terminalAudit\.score\}\/100\*\*/);
        expect(REACT).toMatch(/for \(const c of terminalAudit\.checks\)/);
    });

    it('a skipped run claims nothing — it says nothing was measured', () => {
        expect(REACT).toMatch(/terminal-QA: skipped \(\$\{terminalAudit\?\.skipped \|\| 'no_project'\}\) — nothing was measured, so nothing is claimed/);
    });
});

describe('every check is a real process with a real exit code', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-tqa-'));
    beforeAll(() => {
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
            name: 'x', private: true, type: 'module', scripts: { start: 'node server.js' },
        }));
        fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'server.js'), 'export const a = 1;\n');
    });
    afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows */ } });

    it('a folder that is not a project is skipped, never scored zero', async () => {
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-tqa-empty-'));
        const a = await auditInTerminal(empty, { timeoutMs: 4000 });
        expect(a.skipped).toBe('no_project');
        expect(a.checks).toHaveLength(0);
        try { fs.rmSync(empty, { recursive: true, force: true }); } catch { /* windows */ }
    });

    it('a source that does not parse is caught, and the FILE is named', async () => {
        fs.writeFileSync(path.join(dir, 'db.js'), 'export const db = { ;;; }\n');
        const a = await auditInTerminal(dir, { timeoutMs: 15_000 });
        expect(failingIds(a)).toContain('sources_parse');
        expect(a.checks.find(c => c.id === 'sources_parse')!.detail).toMatch(/db\.js/);
    }, 40_000);

    /**
     * `node --check file.js` exits ZERO on broken ESM in a package with no
     * `"type": "module"` — measured on Node 22. A check that passes broken
     * code is worse than no check, so the parse goal is forced by extension.
     */
    it('the parse goal is forced, not left to node to guess', async () => {
        const SRC = read('core', 'quality', 'terminal-audit.ts');
        expect(SRC).toMatch(/esm \? 'mjs' : 'cjs'/);
        expect(SRC).toMatch(/pkgType === 'module' \|\| \/\^\\s\*\(import\|export\)/);
    });

    it('a healthy source passes the same check', async () => {
        fs.writeFileSync(path.join(dir, 'db.js'), 'export const db = { backend: "json" };\n');
        const a = await auditInTerminal(dir, { timeoutMs: 15_000 });
        expect(failingIds(a)).not.toContain('sources_parse');
    }, 40_000);

    it('each check reports the command it really ran', async () => {
        const a = await auditInTerminal(dir, { timeoutMs: 15_000 });
        expect(a.checks.length).toBeGreaterThan(0);
        expect(a.checks.every(c => !!c.command)).toBe(true);
    }, 40_000);
});

describe('a repair that measured WORSE is taken back, not just un-reported', () => {
    /**
     * From his own run:
     *
     *     self-repair: 78 → 73/100 (5 file(s))
     *     self-repair: no measured gain — keeping the original verdict (78/100)
     *
     * The verdict was kept; the FILES were not. The repaired source had
     * already been rebuilt and packaged into the server, so the system he
     * opened was the 73 one while the report said 78.
     */
    it('the repair cycle hands back the snapshot it took before the first byte', () => {
        expect(REPAIR).toMatch(/snapshotId\?: string;/);
        expect(REPAIR).toMatch(/snapshotId = String\(snapshotProject\(dir, 'قبل الإصلاح الذاتي'\)\?\.id \|\| ''\)/);
        expect(REPAIR).toMatch(/built: true, reverted: false, snapshotId/);
    });

    it('the builder restores it, rebuilds, and re-packages', () => {
        expect(REACT).toMatch(/restoreVersion\(proj, cycle\.snapshotId\)/);
        expect(REACT).toMatch(/rolledBack = rb\.ok === true;/);
        expect(REACT).toMatch(/if \(rolledBack && packaged\) packageIntoApi\(false\);/);
    });

    it('and it says which happened — a rollback is not silent', () => {
        expect(REACT).toMatch(/the repair measured WORSE — rolled the project back and rebuilt it/);
        expect(REACT).toMatch(/no measured gain — keeping the original verdict/);
    });
});
