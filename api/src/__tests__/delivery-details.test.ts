/**
 * THREE THINGS HIS LAST DELIVERY GOT WRONG, IN THE SMALL PRINT.
 *
 *   1. «⛔ Delivered, but it does NOT work properly — 2 blocking finding(s):
 *       • 3 خطأ كونسول: Failed to load resource…» — an English message reading
 *      out Arabic findings. The behaviour audit had carried both languages for
 *      months; the eleven findings in app-audit were Arabic-only.
 *
 *   2. «Owner account: owner@myapp.local — the password is the OLD one. This
 *      project was built over an existing database.» An honest paragraph that
 *      should never have been needed: a fresh build inherited the previous
 *      one's data.db, its rows and an owner whose password he no longer had.
 *
 *   3. «MyApp» — in the title, the header, the folder (`api-myapp`) and the
 *      owner's email. A placeholder that shipped, and the reason two different
 *      builds shared one folder in the first place.
 */
import fs from 'fs';
import path from 'path';
import { findingText, type AppAuditFinding } from '../core/quality/app-audit';
import { brandFallback, brandFrom } from '../core/design/page-head';
import { ProjectPipelineTool } from '../modules/tools/definitions/ProjectPipelineTool';
import { compactPhaseReceipt } from '../modules/services/AgentLoopService';
import { deriveRequestFidelity } from '../modules/tools/definitions/ReactProjectTool';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('048a provenance survives compaction and delivery reporting', () => {
    it('keeps the bound project root, task receipts, and literal rerun failure reason', () => {
        const receipt = compactPhaseReceipt(
            { phaseNumber: 1, results: [{ tool: 'write_file', ok: false, error: 'compiler failed' }] },
            [],
            'failed',
            {
                projectRoot: '/tmp/weathergo-bound',
                taskReceipts: [{ tool: 'write_file', ok: false, error: 'compiler failed' }],
                selfFixFailureReason: 'rerun failed: npm run build exited 1',
            },
        );
        expect(receipt.projectRoot).toBe('/tmp/weathergo-bound');
        expect(receipt.taskReceipts).toEqual([{ tool: 'write_file', ok: false, error: 'compiler failed' }]);
        expect(receipt.selfFixFailureReason).toBe('rerun failed: npm run build exited 1');
    });

    it('derives the weather verdict when appBp is absent and always emits the source diagnostic', () => {
        const verdict = deriveRequestFidelity(
            'Build a real WeatherGo weather app with forecast and saved cities',
            false,
            null,
            'manual scaffold only',
        );
        expect(verdict.engine).toBe('weather');
        expect(verdict.label).toBe('fidelity_unverifiable');
        expect(verdict.diagnostic).toContain('acceptance fidelity verdict: fidelity_unverifiable');
    });

    it('lists files observed on the artifact disk and exposes the literal rerun reason', () => {
        const root = fs.mkdtempSync('/tmp/joe-delivery-');
        try {
            fs.mkdirSync(path.join(root, 'src'), { recursive: true });
            fs.writeFileSync(path.join(root, 'src', 'Favorites.tsx'), 'export default function Favorites(){ return null; }');
            fs.writeFileSync(path.join(root, 'src', 'main.tsx'), 'export default {};');
            const report = (new ProjectPipelineTool() as any).buildDeliveryReport({
                language: 'en',
                projectName: 'WeatherGo',
                phases: [{ tasks: [{ tool: 'write_file', args: { path: 'src/PlannedOnly.tsx' } }] }],
                pipeline: {
                    results: [{
                        projectRoot: root,
                        selfFixFailureReason: 'literal rerun failure: npm run build exited 1',
                    }],
                },
                done: 0,
                total: 1,
                verified: false,
            });
            expect(report).toContain('src/Favorites.tsx');
            expect(report).not.toContain('src/PlannedOnly.tsx');
            expect(report).toContain('Rerun failure reason: `literal rerun failure: npm run build exited 1`');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('says not verified when the checker could not run instead of blaming the product', () => {
        const report = (new ProjectPipelineTool() as any).buildDeliveryReport({
            language: 'en',
            projectName: 'SpendWise',
            phases: [{
                status: 'partial',
                phaseName: 'Final Implementation and Verification',
                completedTasks: 2,
                totalTasks: 2,
                verificationUnavailable: true,
                primaryError: 'verification_unavailable: browser_run action must be an object',
                results: [{
                    task: 'Verify final implementation',
                    tool: 'browser_run',
                    ok: false,
                    error: 'verification_unavailable: browser_run action must be an object',
                }],
            }],
            pipeline: { results: [] },
            done: 3,
            total: 4,
            verified: false,
            verificationUnavailable: true,
        });
        expect(report).toMatch(/not verified|could not verify/i);
        expect(report).not.toContain('some_steps_failed');
        expect(report).not.toContain('the product failed');
    });
});

describe('pipeline delivery preserves the one-time test credential handoff', () => {
    it('surfaces credentials before a long QA report can truncate them', () => {
        const password = 'QuickNotes-Test-9x7m';
        const report = (new ProjectPipelineTool() as any).buildDeliveryReport({
            language: 'ar',
            projectName: 'QuickNotes',
            phases: [],
            pipeline: {
                results: [{
                    status: 'completed',
                    phaseName: 'API',
                    completedTasks: 4,
                    totalTasks: 4,
                    results: [{
                        message: `🗄️ بُنيت واجهة خلفية كاملة\n\n🔐 حسابك (يظهر مرة واحدة):\n   البريد: owner@quicknotes.local\n   كلمة المرور: ${password}\n${'تفصيل تحقق طويل. '.repeat(500)}`,
                    }],
                }],
            },
            done: 1,
            total: 1,
            verified: true,
            browserQa: {
                skipped: false,
                score: 78,
                pressed: 12,
                findings: Array.from({ length: 40 }, (_, index) => ({
                    id: `finding_${index}`,
                    severity: 'low',
                    detail: `ملاحظة ${index}`,
                    detailEn: `Finding ${index} ${'x'.repeat(180)}`,
                })),
            },
        });

        expect(report.length).toBeLessThanOrEqual(3500);
        expect(report.indexOf('### 🔑 بيانات الدخول الاختبارية')).toBeGreaterThanOrEqual(0);
        expect(report.indexOf('owner@quicknotes.local')).toBeGreaterThanOrEqual(0);
        expect(report.indexOf(password)).toBeGreaterThanOrEqual(0);
        expect(report.indexOf('owner@quicknotes.local')).toBeLessThan(report.indexOf('### Browser QA المرئي'));
    });
});

describe('a finding speaks the language of the message it lands in', () => {
    const f: AppAuditFinding = { id: 'console_errors', severity: 'high', detail: '3 خطأ كونسول: x', detailEn: '3 console error(s): x' };

    it('Arabic gets Arabic, English gets English', () => {
        expect(findingText(f, true)).toBe('3 خطأ كونسول: x');
        expect(findingText(f, false)).toBe('3 console error(s): x');
    });

    it('and a finding with no English falls back rather than printing nothing', () => {
        expect(findingText({ id: 'x', severity: 'low', detail: 'عربي فقط' }, false)).toBe('عربي فقط');
    });

    it('every finding the audit raises carries both languages', () => {
        const a = read('core', 'quality', 'app-audit.ts');
        // Every raise site, HOWEVER it wraps — a finding that grew a second
        // line (the offenders it names) is still a finding that must speak
        // both languages, and the assertion must not depend on its formatting.
        const ids = [...a.matchAll(/findings\.push\(\{\s*\n?\s*id: '([a-z0-9_]+)'/g)].map(m => m[1]);
        expect(ids.length).toBeGreaterThanOrEqual(11);
        for (const id of ids) {
            const at = a.search(new RegExp(`findings\\.push\\(\\{\\s*\n?\\s*id: '${id}'`));
            expect(a.slice(at, at + 600)).toMatch(/detailEn:/);
        }
        // …including the ones translated from the behaviour audit.
        expect(a).toMatch(/detail: f\.ar, detailEn: f\.en,/);
        // And the summary prints the reader's language, not the stored one.
        expect(a).toMatch(/a\.findings\.map\(f => `   • \$\{findingText\(f, isAr\)\}`\)/);
    });

    it('and both delivery messages use it instead of the raw Arabic field', () => {
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(r).toMatch(/const say = \(f: any\) => require\('\.\.\/\.\.\/\.\.\/core\/quality\/app-audit'\)\.findingText\(f, isAr\);/);
        expect(r).not.toMatch(/lines\.push\(`   • \$\{f\.detail\}`\)/);
        const p = read('modules', 'tools', 'definitions', 'ProjectRepairTool.ts');
        expect(p).toMatch(/const said = \(f: any\) => findingText\(f, isAr\);/);
        expect(p).not.toMatch(/lines\.push\(`   • \$\{f\.detail\}`\)/);
    });
});

describe('a new build does not inherit an old database', () => {
    it('the api builder moves aside when it finds a data.db', () => {
        const a = read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
        expect(a).toMatch(/if \(fs\.existsSync\(path\.join\(proj, 'data\.db'\)\)\) \{/);
        expect(a).toMatch(/for \(let n = 2; n < 50; n\+\+\)/);
        expect(a).toMatch(/leaving the old one untouched/);
        // The old project is never deleted — his rows are his.
        expect(a).not.toMatch(/rmSync\(path\.join\(proj, 'data\.db'\)/);
    });

    it('and it happens before the folder is created, not after seeding', () => {
        const a = read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
        const check = a.indexOf("if (fs.existsSync(path.join(proj, 'data.db')))");
        const mk = a.indexOf('fs.mkdirSync(proj, { recursive: true });');
        expect(check).toBeGreaterThan(0);
        expect(check).toBeLessThan(mk);
    });
});

describe('«MyApp» is not a name', () => {
    it('an English request lends its own subject', () => {
        expect(brandFallback('Build a simple online store for coffee', false, 'store')).toBe('Coffee Store');
        expect(brandFallback('Create a portfolio site for photography', false, 'portfolio')).toBe('Photography Studio');
    });

    it('an Arabic request gets a signboard, with its article', () => {
        expect(brandFallback('ابنِ متجراً للقهوة المختصة', true, 'store')).toBe('متجر القهوة');
        expect(brandFallback('ابن مطعماً للمشاوي', true, 'restaurant')).toBe('مطعم المشاوي');
    });

    it('a marketplace names itself', () => {
        expect(brandFallback('Build a world-class e-commerce platform similar to Shopify', false, 'store')).toBe('Commerce Hub');
        expect(brandFallback('ابنِ منصّة تجارة إلكترونية', true, 'store')).toBe('سوق التجارة');
    });

    it('and a request that truly says nothing still gets the old placeholder', () => {
        expect(brandFallback('build me a website', false, 'generic')).toBe('MyApp');
        expect(brandFallback('ابن لي موقعاً', true, 'generic')).toBe('مشروعي');
    });

    it('prefers the named product over a quoted prohibition in an evaluation brief', () => {
        const brief = 'DO NOT BUILD A "JOE TEST TEMPLATE". Build a production-grade autonomous software platform called "NEXUS".';
        expect(brandFrom(brief, false)).toBe('NEXUS');
    });

    it('strips Markdown emphasis from an explicitly named product', () => {
        const brief = 'Build a real production-quality web application called **WeatherGo**, not a mockup or placeholder.';
        expect(brandFrom(brief, false)).toBe('WeatherGo');
    });

    it('grammar is never mistaken for a subject', () => {
        // «for the», «for my», «for a» — the request's scaffolding, not its topic.
        expect(brandFallback('Build a site for my business', false, 'generic')).toBe('MyApp');
        expect(brandFallback('Build a website for the company', false, 'generic')).toBe('MyApp');
    });

    it('and both builders use it', () => {
        // The api tool now reads the brand from the request WITHOUT the
        // category declaration («بفئات: …» shipped «مشروع الات،» as a name,
        // measured live) — the guarantee is the same chain, fed clean text.
        for (const [tool, req] of [['ReactProjectTool.ts', 'request'], ['ApiProjectTool.ts', 'requestForReading']] as const) {
            const t = read('modules', 'tools', 'definitions', tool);
            expect(t).toMatch(new RegExp(`brandFrom\\(${req}, isAr\\) \\|\\| brandFallback\\(${req}, isAr, kind\\)`));
            expect(t).not.toMatch(/\|\| \(isAr \? 'مشروعي' : 'MyApp'\)/);
        }
    });
});
