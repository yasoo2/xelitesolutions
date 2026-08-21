/**
 * SELF-QA, locked — the scoring is arithmetic, the wiring is real, and the
 * no-browser case is an honest SKIP, never an invented score. The browser
 * side (a clean build scoring high, a sabotaged one caught by name) runs in
 * src/tests/manual/verify_app_audit.ts against real Chromium.
 */
import fs from 'fs';
import path from 'path';
import { scoreOf, formatAudit } from '../core/quality/app-audit';
import { earlyProjectDeclarationForTest } from '../modules/tools/definitions/ReactProjectTool';
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
        expect(auditSrc).toContain("id: 'auth_failed'");
        expect(reactSrc).toContain('...(runtimeAuth ? { credentials: runtimeAuth } : {}),');
        expect(reactSrc).toContain('const runtimeAuth =');
        expect(storeSrc).toContain('delete copy.runtimeAuth;');
        expect(storeSrc).toContain('delete copy.ownerPassword;');
    });
    it('labels a proven authenticated pass in the chat verdict', () => {
        const verdict = formatAudit({ score: 100, findings: [], authenticated: true }, true);
        expect(verdict).toContain('دخول محمي مثبت');
    });
});

describe('the early project-kind declaration is a request-level terminal behavior', () => {
    const arabicRequest = 'ابنِ تطبيقاً بعنوان Gate 062 يحتوي على عداد ظاهر وزر تفاعلي ورسالة حالة قصيرة.';

    it('generic fallback names only the elements actually understood from the request', () => {
        const announcement = earlyProjectDeclarationForTest({
            request: arabicRequest,
            isArabic: true,
            appKind: null,
        });
        expect(announcement).toContain('لا أعرف نوع هذا التطبيق');
        expect(announcement).toContain('عدّاد أو إجمالي');
        expect(announcement).toContain('زر تفاعلي');
        expect(announcement).toContain('عنوان أو رأس صفحة');
        expect(announcement).toContain('رسالة حالة أو نتيجة');
    });

    it('generic fallback reads the exact Gate062 acceptance prompt in the request language', () => {
        const announcement = earlyProjectDeclarationForTest({
            request: GATE062_ACCEPTANCE_PROMPT,
            isArabic: false,
            appKind: null,
        });
        expect(announcement).toContain('counter or total');
        expect(announcement).toContain('interactive button');
        expect(announcement).toContain('heading or title');
        expect(announcement).toContain('status message or result');
    });

    it('authored engines explain the practical uncertainty in the request language while stock engines stay silent', () => {
        expect(earlyProjectDeclarationForTest({
            request: 'ابنِ تطبيق طقس', isArabic: true, appKind: 'weather',
            generatedEnginePath: 'src/components/WeatherApp.jsx',
        })).toContain('سأؤلّف محرّك هذا التطبيق بدلاً من استعمال محرّك جاهز، والنتيجة غير مضمونة.');
        expect(earlyProjectDeclarationForTest({
            request: 'Build a weather app', isArabic: false, appKind: 'weather',
            generatedEnginePath: 'src/components/WeatherApp.jsx',
        })).toContain("I will author this app's engine instead of using a ready-made engine; the result is not guaranteed.");
        expect(earlyProjectDeclarationForTest({
            request: 'Build a finance app', isArabic: false, appKind: 'finance',
        })).toBeNull();
        expect(earlyProjectDeclarationForTest({
            request: 'Build an account app', isArabic: false, appKind: 'account',
        })).toBeNull();
    });

    it('removing the counter word removes only the counter understanding', () => {
        const withoutCounter = earlyProjectDeclarationForTest({
            request: arabicRequest.replace('عداد ', ''),
            isArabic: true,
            appKind: null,
        });
        expect(withoutCounter).not.toContain('عدّاد أو إجمالي');
        expect(withoutCounter).toContain('زر تفاعلي');
        expect(withoutCounter).toContain('رسالة حالة أو نتيجة');
    });

    it('is wired to the terminal after the authoritative runBp and before app files are built', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(src).toContain('if (declaration) term(declaration);');
        const runBpAt = src.indexOf('let runBp: any = appBp;');
        const declarationAt = src.indexOf('const declaration = earlyProjectDeclarationForTest({', runBpAt);
        const buildAt = src.indexOf('const appFiles = buildAppFiles(runBp, {', declarationAt);
        expect(runBpAt).toBeGreaterThan(-1);
        expect(declarationAt).toBeGreaterThan(runBpAt);
        expect(buildAt).toBeGreaterThan(declarationAt);
    });
});
