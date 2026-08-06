/**
 * SELF-QA, locked — the scoring is arithmetic, the wiring is real, and the
 * no-browser case is an honest SKIP, never an invented score. The browser
 * side (a clean build scoring high, a sabotaged one caught by name) runs in
 * src/tests/manual/verify_app_audit.ts against real Chromium.
 */
import fs from 'fs';
import path from 'path';
import { scoreOf, formatAudit } from '../core/quality/app-audit';

describe('the audit arithmetic', () => {
    it('the same finding always costs the same; the floor is 0', () => {
        expect(scoreOf([])).toBe(100);
        expect(scoreOf([{ id: 'a', severity: 'high', detail: '' }])).toBe(85);
        expect(scoreOf([
            { id: 'a', severity: 'high', detail: '' },
            { id: 'b', severity: 'medium', detail: '' },
            { id: 'c', severity: 'low', detail: '' },
        ])).toBe(74);
        expect(scoreOf(Array.from({ length: 10 }, (_, i) => ({ id: String(i), severity: 'high' as const, detail: '' })))).toBe(0);
    });
    it('the chat verdict names every finding and never buries a skip', () => {
        expect(formatAudit({ score: 100, findings: [] }, true)).toContain('100/100');
        const withFindings = formatAudit({ score: 85, findings: [{ id: 'dead_images', severity: 'high', detail: '3 صورة لم تُرسم' }] }, true);
        expect(withFindings).toContain('85/100');
        expect(withFindings).toContain('3 صورة لم تُرسم');
        expect(formatAudit({ skipped: 'playwright not installed', score: 0, findings: [] }, true)).toContain('تخطيته');
    });
});

describe('the wiring — every green build gets measured', () => {
    it('ReactProjectTool audits after built, streams the verdict, stores lastAudit', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        const at = src.indexOf('auditBuiltApp');
        expect(at).toBeGreaterThan(0);
        expect(src.slice(at - 400, at)).toContain('built && !input?.skipAudit');
        expect(src).toContain('self-QA:');
        expect(src).toContain('lastAudit');
        /**
         * …and the verdict is formatted in the USER'S language and carried by
         * BOTH branches of the delivery message. This line used to pin
         * `formatAudit(audit, true)` — hardcoded Arabic — which was half the
         * defect: the English branch of that message reported no audit at all,
         * so a build asked for in English spent a minute measuring itself and
         * told the user nothing.
         */
        expect(src).toContain('formatAudit(audit, isAr)');
        expect(src).not.toContain('formatAudit(audit, true)');
        expect((src.match(/\$\{qaBlock\}/g) || []).length).toBe(2);
    });
    it('a missing dist is an honest skip', async () => {
        const { auditBuiltApp } = require('../core/quality/app-audit');
        const a = await auditBuiltApp('/nowhere/dist');
        expect(a.skipped).toContain('no dist');
    });
});
