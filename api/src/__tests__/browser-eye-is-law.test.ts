import fs from 'fs';
import os from 'os';
import path from 'path';

describe('visible browser QA is a hard requirement when requested', () => {
    it('refuses an invisible fallback when no Browser panel is watching', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-eye-'));
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><body><main>QA</main></body></html>');
        try {
            const { auditBuiltApp } = require('../core/quality/app-audit');
            const result = await auditBuiltApp(dir, {
                watchSessionId: 'no-visible-panel-for-this-test',
                requireVisibleBrowser: true,
            });
            expect(result.skipped).toMatch(/browser eye required/i);
            expect(result.visible).toBe(false);
            expect(result.score).toBe(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('keeps the watcher requirement wired through every generated-app audit round', () => {
        const react = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
        const repair = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRepairTool.ts'), 'utf8');
        expect((react.match(/requireVisibleBrowser: true/g) || []).length).toBeGreaterThanOrEqual(3);
        expect(repair).toContain('requireVisibleBrowser: true');
        expect(fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'), 'utf8')).toContain('isEyeOpen');
    });
});
