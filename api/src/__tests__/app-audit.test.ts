/**
 * SELF-QA, locked — the scoring is arithmetic, the wiring is real, and the
 * no-browser case is an honest SKIP, never an invented score. The browser
 * side (a clean build scoring high, a sabotaged one caught by name) runs in
 * src/tests/manual/verify_app_audit.ts against real Chromium.
 */
import fs from 'fs';
import path from 'path';
import { scoreOf, formatAudit } from '../core/quality/app-audit';
import { earlyProjectDeclaration } from '../modules/tools/definitions/ReactProjectTool';
import * as acceptance from '../core/quality/acceptance';
import { GATE062_ACCEPTANCE_PROMPT } from '../core/quality/acceptance';

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
        // A skip is a WARNING, with its reason — never a footnote that reads
        // like everything went fine.
        const skipped = formatAudit({ skipped: 'playwright not installed', score: 0, findings: [] } as any, true);
        expect(skipped).toContain('لم أفحص الصفحة بصرياً');
        expect(skipped).toContain('playwright not installed');
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
        expect(a.skipped).toContain('no index.html');
    });

    it('keeps the shared /artifacts alias rooted at the artifact directory', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');
        expect(src).toContain('artifactRootDir?: string');
        expect(src).toContain("process.env.ARTIFACT_DIR || distDir");
        expect(src).toContain('const artifactRequest = /^\\/artifacts');
        expect(src).toContain('const root = artifactRequest ? artifactRoot : path.resolve(distDir)');
    });

    it('does not overwrite a real live preview with the static project-preview proxy', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(src).toContain('if (built && !liveServer)');
        expect(src).toContain('} else if (liveServer) {');
        expect(src).toContain('previewUrl = liveServer.url;');
    });
    it('supports authenticated QA without persisting plaintext credentials', () => {
        const auditSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');
        const reactSrc = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'page-store.ts'), 'utf-8');
        expect(auditSrc).toContain('credentials?: {');
        expect(auditSrc).toContain("fetch(loginUrl, {");
        expect(auditSrc).toContain("localStorage.setItem(tokenStorageKey, token)");
        expect(auditSrc).toContain("localStorage.setItem(tokenStorageKey + ':role'");
        expect(auditSrc).toContain("tokenStorageKey: c.tokenStorageKey || 'joe:auth'");
        expect(auditSrc).toContain("input[type=\"email\"]");
        expect(auditSrc).toContain("form button[type=\"submit\"]");
        expect(auditSrc).toContain('Math.min(timeoutMs, 12_000)');
        expect(auditSrc).toContain('the protected browser surface did not appear');
        expect(auditSrc).toContain("/^(sign out|log out|logout|تسجيل الخروج|خروج)$/iu");
        expect(auditSrc).toContain("id: 'auth_failed'");
        expect(auditSrc).toContain("id: 'authenticated_coverage_missing'");
        expect(auditSrc).toContain('requireAuthenticatedCoverage?: boolean');
        expect(auditSrc).toContain('if (c.token)');
        const behaviourSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'), 'utf-8');
        expect(behaviourSrc).toContain('Session exit and destructive mutations are scenario boundaries');
        expect(behaviourSrc).toContain('sign\\s*out|log\\s*out|logout');
        expect(behaviourSrc).toContain('delete|remove|حذف|إزالة');
        expect(reactSrc).toContain('...(runtimeAuth ? { credentials: runtimeAuth } : {}),');
        expect(reactSrc).toContain('const runtimeAuth =');
        expect(storeSrc).toContain('delete copy.runtimeAuth;');
        expect(storeSrc).toContain('delete copy.ownerPassword;');
    });

    it('gives required Browser QA enough bounded time to cover routes and responsive states', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(src).toContain('timeoutMs: 180_000');
        expect(src).not.toContain('timeoutMs: 60_000');
    });

    it('caps one control pass so visual and responsive evidence cannot be starved', () => {
        const audit = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');
        expect(audit).toContain('CONTROL_PASS_BUDGET_MS = 45_000');
        expect(audit).toContain('budgetMs: Math.min(CONTROL_PASS_BUDGET_MS, remainingWalkMs())');
    });
    it('labels a proven authenticated pass in the chat verdict', () => {
        const verdict = formatAudit({ score: 100, findings: [], authenticated: true }, true);
        expect(verdict).toContain('دخول محمي مثبت');
    });
    it('tests semantic field types with both valid and invalid values', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'), 'utf-8');
        expect(src).toContain('semanticFieldsTested');
        expect(src).toContain("bad = semantic === 'email' ? 'not-an-email'");
        expect(src).toContain('input.checkValidity()');
        expect(src).toContain("code: 'semantic_input_validation'");
        expect(src).toContain("case 'tel': return '0555123456'");
        expect(src).toContain("case 'date': return iso");
    });
    it('runs and reports a real cross-layer quality matrix for generated systems', () => {
        const terminal = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'terminal-audit.ts'), 'utf-8');
        const react = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(terminal).toContain("await add('app_tests', 'npm test'");
        expect(terminal).toContain("const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'");
        for (const label of ['Functional', 'Integration', 'System', 'Acceptance and UAT', 'Security', 'Non-functional', 'Regression']) {
            expect(react).toContain(label);
        }
        expect(react).toContain('Proven quality matrix');
        expect(react).toContain("checks.get('writes_protected') === true && !!audit?.authenticated");
    });

    it('names each browser QA pass in the delivery verdict', () => {
        const verdict = formatAudit({
            score: 85,
            findings: [{ id: 'dead_controls', severity: 'medium', detail: 'one control did not change state' }],
            passes: [
                { id: 'runtime', label: 'runtime and network', status: 'passed', measured: 2, findingIds: [] },
                { id: 'behaviour', label: 'controls and forms', status: 'failed', measured: 7, findingIds: ['dead_controls'] },
                { id: 'design', label: 'visual, accessibility and responsive', status: 'passed', measured: 3, findingIds: [] },
            ],
        }, false);
        expect(verdict).toContain('Browser QA suite');
        expect(verdict).toContain('runtime and network: passed');
        expect(verdict).toContain('controls and forms: failed');
        expect(verdict).toContain('visual, accessibility and responsive: passed');
    });
});

describe('the early project-kind declaration is a request-level terminal behavior', () => {
    const arabicRequest = 'ابنِ تطبيقاً بعنوان Gate 062 يحتوي على عداد ظاهر وزر تفاعلي ورسالة حالة قصيرة.';

    it('generic fallback names only the elements actually understood from the request', () => {
        const announcement = earlyProjectDeclaration({
            request: arabicRequest,
            isArabic: true,
            appKind: null,
        });
        expect(announcement).toContain('لا أعرف نوع هذا التطبيق');
        expect(announcement).toContain('عداد أو إجمالي');
        expect(announcement).toContain('زر تفاعلي');
        expect(announcement).toContain('عنوان أو رأس صفحة');
        expect(announcement).toContain('رسالة حالة أو نتيجة');
    });

    it('generic fallback reads the exact Gate062 acceptance prompt in the request language', () => {
        const announcement = earlyProjectDeclaration({
            request: GATE062_ACCEPTANCE_PROMPT,
            isArabic: false,
            appKind: null,
        });
        expect(announcement).toContain('counter or total');
        expect(announcement).toContain('interactive button');
        expect(announcement).toContain('a title or heading');
        expect(announcement).toContain('a status or result message');
    });

    it('the negative account request does not invent a counter understanding', () => {
        const announcement = earlyProjectDeclaration({
            request: 'Build an account app for account details and login.',
            isArabic: false,
            appKind: null,
        });
        expect(announcement).not.toContain('counter or total');
        expect(announcement).toContain('no clear interactive element');
    });

    it('reads a temporary catalogue criterion through acceptanceFor without changing the announcer', () => {
        const realAcceptanceFor = acceptance.acceptanceFor;
        const fakeCriterion = {
            id: 'temporary_probe',
            kind: 'feature' as const,
            ar: 'معيار وهمي مؤقت',
            en: 'a temporary fake criterion',
            markers: [],
        };
        const spy = jest.spyOn(acceptance, 'acceptanceFor')
            .mockImplementation(request => [...realAcceptanceFor(request), fakeCriterion]);
        try {
            const announcement = earlyProjectDeclaration({
                request: 'Build an account app for account details and login.',
                isArabic: false,
                appKind: null,
            });
            expect(announcement).toContain('a temporary fake criterion');
            expect(announcement).not.toContain('counter or total');
        } finally {
            spy.mockRestore();
        }
    });

    it('authored engines explain the practical uncertainty in the request language while stock engines stay silent', () => {
        expect(earlyProjectDeclaration({
            request: 'ابنِ تطبيق طقس', isArabic: true, appKind: 'weather',
            generatedEnginePath: 'src/components/WeatherApp.jsx',
        })).toContain('سأؤلّف محرّك هذا التطبيق بدلاً من استعمال محرّك جاهز، والنتيجة غير مضمونة.');
        expect(earlyProjectDeclaration({
            request: 'Build a weather app', isArabic: false, appKind: 'weather',
            generatedEnginePath: 'src/components/WeatherApp.jsx',
        })).toContain("I will author this app's engine instead of using a ready-made engine; the result is not guaranteed.");
        expect(earlyProjectDeclaration({
            request: 'Build a finance app', isArabic: false, appKind: 'finance',
        })).toBeNull();
        expect(earlyProjectDeclaration({
            request: 'Build an account app', isArabic: false, appKind: 'account',
        })).toBeNull();
    });

    it('removing the counter word removes only the counter understanding', () => {
        const withoutCounter = earlyProjectDeclaration({
            request: arabicRequest.replace('عداد ', ''),
            isArabic: true,
            appKind: null,
        });
        expect(withoutCounter).not.toContain('عداد أو إجمالي');
        expect(withoutCounter).toContain('زر تفاعلي');
        expect(withoutCounter).toContain('رسالة حالة أو نتيجة');
    });

});
