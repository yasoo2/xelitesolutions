/**
 * A REAL PROMPT WENT THROUGH JOE, AND THE PAGE WORE IT.
 *
 * An outside test sent a brief a person would actually write — a landing page
 * for a design workshop called «نور», inside a sandbox, with constraints: no
 * internet, no deploy, no installing packages. What came back was a working
 * Vite project whose `<h1>` was the brief. All five hundred characters of it,
 * instructions included:
 *
 *   «نور — أنت تعمل داخل مساحة اختبار معزولة … لا تنشر، لا تثبت حزمًا من
 *    الشبكة … أكمل المهمة ذاتيًا ولا تطلب مني توضيحًا.»
 *
 * Reproduced here at HEAD before anything was changed, character for
 * character. Three more findings from the same run were reproduced too: the
 * build installed 63 packages after being told not to, the message announced a
 * live preview that no process was serving, and a skipped browser audit read
 * like a footnote instead of a warning.
 *
 * Each of the four is pinned below, at the level where it was actually wrong.
 */
import fs from 'fs';
import path from 'path';
import { subjectPhrase, isInstructionClause, saysNoInstall } from '../core/design/subject-phrase';
import { formatAudit } from '../core/quality/app-audit';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const REACT = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

/** The brief, verbatim, as it was sent. */
const BRIEF = [
    'أنت تعمل داخل مساحة اختبار معزولة. أنشئ في مساحة العمل الحالية تطبيق صفحة هبوط عربية',
    'متجاوبة لورشة تصميم اسمها «نور». المطلوب: أنشئ ملفات مشروع React قابلة للتشغيل محليًا من',
    'دون نشر؛ صمم قسماً افتتاحياً وخدمات وبطاقات أعمال وزر تواصل وتذييلاً؛ افحص النتيجة عبر',
    'الطرفية ببناء أو فحص مناسب؛ واستخدم المعاينة أو المتصفح فقط إن كانا متاحين محليًا. في',
    'النهاية اذكر الملفات التي أنشأتها والفحوص التي نفذتها. لا تستخدم الإنترنت، لا تنشر، لا',
    'تثبت حزمًا من الشبكة، ولا تعدّل أي ملف خارج مساحة العمل. أكمل المهمة ذاتيًا ولا تطلب مني توضيحًا.',
].join(' ');

describe('the brief becomes a headline, not a wall', () => {
    it('the workshop is what the page is about', () => {
        expect(subjectPhrase(BRIEF)).toBe('ورشة تصميم');
    });

    it('and not one word of the instructions survives into it', () => {
        const out = subjectPhrase(BRIEF);
        for (const leak of ['لا تنشر', 'مساحة اختبار', 'أكمل المهمة', 'الإنترنت', 'المطلوب']) {
            expect(out).not.toContain(leak);
        }
        // A headline is a headline: this was 500 characters.
        expect(out.length).toBeLessThanOrEqual(72);
    });

    /**
     * The old line deleted `لي` as a SUBSTRING, so «الحالية» became «الحا ة»
     * and «محليًا» became «مح ًا» — visible, in the delivered page.
     */
    it('Arabic words are never cut open from the inside', () => {
        const out = subjectPhrase('ابنِ لي موقع للحالة الطبية محليًا اسمه شفاء');
        expect(out).not.toMatch(/الحا\s|مح\s/);
    });

    it('the naming shape works across domains, in both languages', () => {
        expect(subjectPhrase('ابنِ لي موقع لمطعم إيطالي اسمه لا بيلا')).toBe('مطعم إيطالي');
        expect(subjectPhrase('Build a landing page for a design studio called Noor')).toBe('design studio');
        expect(subjectPhrase('ابنِ نظام عيادة بيطرية اسمها دار الرفق مع قاعدة بيانات')).toBe('نظام عيادة بيطرية');
    });

    it('a request with no subject yields NOTHING — the caller then says something neutral', () => {
        // Better a generic tagline than the user's own instructions read back.
        expect(subjectPhrase('ابن لي موقع')).toBe('');
        expect(subjectPhrase('لا تنشر ولا تستخدم الإنترنت')).toBe('');
    });

    it('a plain description is still kept when nobody named anything', () => {
        expect(subjectPhrase('اعمل لي متجر إلكتروني لبيع العسل')).toBe('متجر إلكتروني لبيع العسل');
    });

    it('instruction clauses are recognised by SHAPE, not by topic', () => {
        for (const c of ['لا تنشر الموقع', 'أكمل المهمة ذاتيًا', 'في النهاية اذكر الملفات',
            'أنت تعمل داخل مساحة اختبار', 'do not deploy', 'make sure to run the tests']) {
            expect(isInstructionClause(c)).toBe(true);
        }
        for (const c of ['ورشة تصميم اسمها نور', 'مطعم إيطالي في جدة', 'a design studio in Riyadh']) {
            expect(isInstructionClause(c)).toBe(false);
        }
    });

    it('and the builder really uses it', () => {
        expect(REACT).toMatch(/const \{ subjectPhrase \} = require\('\.\.\/\.\.\/\.\.\/core\/design\/subject-phrase'\);/);
        expect(REACT).toMatch(/const subject = subjectPhrase\(request\);/);
        // The line that caused it is gone.
        expect(REACT).not.toMatch(/request\.replace\(\/\(ابنِ\|ابني\|انشئ/);
    });
});

describe('«لا تثبت حزمًا» is an instruction, not decoration', () => {
    it('the refusal is read out of his own words', () => {
        expect(saysNoInstall(BRIEF)).toBe(true);
        expect(saysNoInstall('ابنِ موقع بدون إنترنت')).toBe(true);
        expect(saysNoInstall('build it offline please')).toBe(true);
        expect(saysNoInstall('no network install')).toBe(true);
        // An offline product requirement or acceptance condition is not a
        // request to disable npm install/build.
        expect(saysNoInstall('Do not announce delivery if the app is offline')).toBe(false);
        expect(saysNoInstall('the app must work offline')).toBe(false);
        expect(saysNoInstall('cache data for offline use')).toBe(false);
    });

    it('…and an ordinary request is left alone', () => {
        expect(saysNoInstall('ابنِ لي موقع مطعم')).toBe(false);
        expect(saysNoInstall('build me a store')).toBe(false);
        // «انشر المشروع» is about deploying, not about installing.
        expect(saysNoInstall('ابنِ الموقع وانشره')).toBe(false);
    });

    it('the build honours it, and says which step it skipped and why', () => {
        expect(REACT).toMatch(/const noInstall = !!input\?\.skipInstall \|\| saysNoInstall\(request\);/);
        expect(REACT).toMatch(/if \(!noInstall\) \{/);
        expect(REACT).toMatch(/لم أثبّت أي حزمة لأن طلبك منع ذلك/);
        // Obeying is announced in the terminal too — it is a decision, not a
        // silent no-op.
        expect(REACT).toMatch(/policy: the request says not to install packages/);
    });
});

describe('nothing is claimed that is not running', () => {
    /**
     * «والمعاينة الحية فُتحت تلقائياً» was printed unconditionally, on runs
     * where no Vite process existed and no port was listening. The reviewer
     * had to start one by hand to see the page.
     */
    it('a live preview is announced only when a server is really up', () => {
        expect(REACT).not.toMatch(/والمعاينة الحية فُتحت تلقائياً/);
        expect(REACT).toMatch(/liveServer \? ` والمعاينة الحية تعمل الآن على \$\{liveServer\.url\}`/);
        expect(REACT).toMatch(/ولم أُبقِ خادم معاينة يعمل/);
    });

    it('and a browser audit that never ran reads as a warning, not a footnote', () => {
        const skipped = { skipped: 'chromium_missing', score: 0, findings: [] };
        const ar = formatAudit(skipped, true);
        const en = formatAudit(skipped, false);
        expect(ar).toContain('⚠️ لم أفحص الصفحة بصرياً');
        expect(en).toContain('This page was NOT visually checked');
        // With the reason and the one command that fixes it.
        expect(ar).toContain('npx playwright install chromium');
        expect(en).toContain('npx playwright install chromium');
        expect(ar).not.toContain('100/100');
        expect(en).not.toContain('100/100');
    });
});
