/**
 * «ولكن جو لم يصنع أي شيء ظاهر من هذه الخطوات نهائياً»
 *
 * Sixty-two seconds of his run went into three steps that reached him as
 * nothing at all:
 *
 *     🔎 Self-QA in a real browser…                              29s
 *     👁️ Watch it happen in the Browser panel…                    9s
 *     🛠️ Repairing what I can fix myself, then rebuilding…       24s
 *     self-QA: 59/100 — console_errors, failed_requests, small_targets, form_no_validation
 *     self-repair: 59 → 67/100 (4 file(s))
 *
 * The work was real and it was not lost. The ARABIC branch of the delivery
 * message reports the score, every finding in words, and every repair. The
 * ENGLISH branch went straight from the file list to «npm install + vite build
 * succeeded» — no audit, no repair, no findings. Two branches of one message
 * that were never the same message, and his request happened to take the
 * silent one.
 *
 * And 67/100 is not a clean bill: findings SURVIVED the repair, and none of
 * them were named either. One of them was `failed_requests` — the very
 * `%22C:/Users/…jpg%22 404` he was looking at on the screen.
 */
import fs from 'fs';
import path from 'path';
import { formatAudit } from '../core/quality/app-audit';

const SRC = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

describe('the self-QA reaches the user in whatever language he asked in', () => {
    it('the section is built once, not per branch', () => {
        const src = SRC();
        expect(src).toMatch(/const qaBlock = \(\(\) => \{/);
        expect((src.match(/\$\{qaBlock\}/g) || []).length).toBe(2);   // Arabic AND English
    });

    it('and it is formatted in the user\'s language, not hardcoded Arabic', () => {
        const src = SRC();
        const at = src.indexOf('const qaBlock = (() => {');
        const block = src.slice(at, src.indexOf('const message = isAr', at));
        expect(block).toMatch(/formatAudit\(audit, isAr\)/);
        expect(block).not.toMatch(/formatAudit\(audit, true\)/);
    });

    it('the English branch is no longer silent about the audit', () => {
        const src = SRC();
        const en = src.indexOf("A full React project, scaffolded AND verified to compile");
        const branch = src.slice(en, en + 700);
        expect(branch).toContain('${qaBlock}');
        // …and it still precedes the path, where a reader looks first.
        expect(branch.indexOf('${qaBlock}')).toBeLessThan(branch.indexOf('📂 Path'));
    });

    it('what the repair CHANGED is named — the files, not just a count', () => {
        const src = SRC();
        const at = src.indexOf('const qaBlock = (() => {');
        const block = src.slice(at, src.indexOf('const message = isAr', at));
        expect(block).toMatch(/for \(const r of selfRepair\.repairs\)/);
        expect(block).toMatch(/for \(const f of selfRepair\.files\)/);
    });

    it('and what SURVIVED it is named too — 67\\/100 is not a clean bill', () => {
        const src = SRC();
        const at = src.indexOf('const qaBlock = (() => {');
        const block = src.slice(at, src.indexOf('const message = isAr', at));
        expect(block).toMatch(/ما زال قائماً بعد الإصلاح — لم أُخفِه/);
        expect(block).toMatch(/Still there after the repair — not hidden/);
        expect(block).toMatch(/for \(const f of left\) lines\.push/);
    });
});

describe('a finding is a sentence, not a slug', () => {
    const audit = (findings: any[], score: number) =>
        ({ skipped: '', score, findings, routes: ['/'], pressed: 4 } as any);

    it('prints the detail the browser measured, in both languages', () => {
        const a = audit([
            { id: 'failed_requests', severity: 'high', detail: '404 على /%22C:/Users/home/…jpg%22' },
            { id: 'small_targets', severity: 'low', detail: '3 عناصر تفاعلية أصغر من 24px' },
        ], 59);
        for (const isAr of [true, false]) {
            const text = formatAudit(a, isAr);
            expect(text).toContain('404 على /%22C:/Users/home/…jpg%22');
            expect(text).toContain('3 عناصر تفاعلية أصغر من 24px');
            expect(text).toContain('59');
            // never the bare slug list he was given
            expect(text).not.toMatch(/failed_requests, small_targets/);
        }
    });

    it('says how much was really pressed, on how many pages', () => {
        const text = formatAudit(audit([{ id: 'x', severity: 'low', detail: 'y' }], 90), true);
        expect(text).toMatch(/1 صفحة، 4 عنصر مضغوط/);
    });

    it('…and how many forms were filled in and sent, and at how many widths', () => {
        // «تعبئه النماذج» and «فحص ui»: both are countable, so both are counted.
        const deep = formatAudit({
            score: 84, findings: [{ id: 'low_contrast', severity: 'low', detail: 'تباين ضعيف' }],
            routes: ['/', '#/admin'], pressed: 31, formsFilled: 2, fieldsFilled: 9,
            viewports: ['390x844', '820x1180', '1280x900'],
        }, true);
        expect(deep).toContain('2 صفحة');
        expect(deep).toContain('31 عنصر مضغوط');
        expect(deep).toContain('2 نموذج معبّأ ومُرسل');
        expect(deep).toContain('9 حقل');
        expect(deep).toContain('3 مقاسات شاشة');
        const en = formatAudit({
            score: 84, findings: [], routes: ['/'], pressed: 31, formsFilled: 2, fieldsFilled: 9,
            viewports: ['390x844', '820x1180', '1280x900'],
        }, false);
        expect(en).toContain('2 form(s) filled and submitted');
        expect(en).toContain('3 viewport(s)');
    });

    it('and a clean run says so without inventing findings', () => {
        expect(formatAudit(audit([], 100), true)).toContain('100/100');
        expect(formatAudit(audit([], 100), false)).toContain('clean');
    });

    it('a skipped audit is reported as skipped, never as a pass', () => {
        const text = formatAudit({ skipped: 'no_dist', score: 0, findings: [] } as any, true);
        expect(text).toContain('تخطيته');
        expect(text).not.toContain('100/100');
    });
});
