/**
 * «لا تعدل أو تحذف أي ملف» DENIES EVERY FILE CHANGE.
 *
 * The Arabic reader knew one verb and the plural — «لا تعدل الملفات», «لا تنشئ
 * الملفات». A denial with two verbs («لا تعدل أو تحذف أي ملف», «لا تعدل ولا
 * تحذف أي ملف»), joined to the sentence before it («راجع الكود ولا تعدل أي
 * ملف»), or about «any file» in the singular was no denial at all; and since
 * «أي» is also «which», each of them was answered as a question about files.
 * In English the list had to open with a changing verb and could not end
 * «, or delete»: "Do not delete or modify any file" was a read-only audit,
 * "Do not create, modify, or delete any file" an answer-only contract.
 *
 * A denial is a list of verbs and its object. It denies file CHANGES when the
 * list holds a verb that changes a file, wherever that verb stands; and it
 * denies EVERY change only when its object is every file. «لا تعدل ملف
 * الإعدادات» protects one file and is an exclusion, as it always was.
 */
import { hasRequestedAction, deniesEveryFileChange, stripScopedExclusions } from '../core/intelligence/requested-action';
import { isKnowledgeQuestionStructural, isBuildRequest } from '../core/intelligence/intent-classifier';

const reading = (text: string) => {
    const r = hasRequestedAction(text);
    return { every: deniesEveryFileChange(text), noFileChanges: r.isNoFileChanges, denial: r.hasDenial, order: r.hasAffirmativeAction };
};

describe('a list of verbs and every file: no file may change', () => {
    it.each([
        'لا تعدل أو تحذف أي ملف',
        'لا تعدل ولا تحذف أي ملف',
        'لا تعدل او تحذف اي ملف',
        'لا تعدل وتحذف أي ملف',
        'لا تعدل، ولا تحذف أي ملف',
        'لا تعدل، تحذف أو تنشئ أي ملف',
        'لا تحذف أو تعدل أي ملف',
        'لا تعدل أو تحذف الملفات',
        'لا تعدل ولا تحذف ولا تنشئ أي ملفات',
        'لا تعدل أو تحذف ملفاتي',
        'لا تغير أو تحذف أي ملف في المشروع',
        'لا تعدل أي ملف',
        'لا تعدل أي ملف بدون إذني',
        'لا تعدل كل الملفات',
        'راجع الكود وقلي المشاكل، لا تعدل أو تحذف أي ملف',
        'راجع الكود ولا تعدل أو تحذف أي ملف',
        'بدون تعديل أي ملف، اشرح لي المشكلة',
        'لا تُعدِّلْ أو تحذِفْ أيَّ ملفٍ',
        'لا تعدّل أو تحذف أيّ ملف',
        'لا تعدل ولا تحذف شيئا',
        'لا تعدل أو تحذف أي شيء',
        'Do not modify or delete any file',
        'Do not modify or delete any files',
        'Do not delete or modify any file',
        'do not edit or remove any files',
        'Do not change or delete the files',
        'Do not create, modify, or delete any file',
        'Do not create, modify or delete any file',
        'Review the code. Do not modify or delete any file.',
    ])('%s', text => {
        expect(reading(text)).toMatchObject({ every: true, noFileChanges: true, denial: true, order: false });
        expect(isBuildRequest(text).isBuild).toBe(false);
    });
});

describe('a denial about some files is still an exclusion, never a denial of every change', () => {
    it.each([
        'لا تعدل ملف الإعدادات',
        'لا تعدل أو تحذف ملف الإعدادات',
        'لا تعدل أو تحذف أي ملف آخر',
        'لا تعدل أو تحذف أي ملفات أخرى',
        'لا تعدل ملفات إنتاج أو إعدادات أو أسرار',
        'لا تعدل ملفات أخرى، فقط أنشئ ملف notes.txt فيه كلمة مرحبا',
        'لا تعدل الملفات في مجلد src',
        'غيّر العنوان، لا تعدل ملفات الإعدادات',
        'غير العنوان ولا تعدل أو تحذف أي ملف آخر',
        'عدل الصفحة الرئيسية ولا تعدل أي ملف آخر',
        'أنشئ ملف notes.txt ولا تعدل أو تحذف أي ملف غيره',
        'Do not change any other files.',
        'Do not modify or delete any other files.',
        'Do not delete or modify any other files.',
        'Do not modify or delete the config file',
        'Create notes.txt. Do not modify or delete any other file.',
    ])('%s', text => {
        expect(deniesEveryFileChange(text)).toBe(false);
    });

    it.each([
        'غيّر العنوان، لا تعدل ملفات الإعدادات',
        'غير العنوان ولا تعدل أو تحذف أي ملف آخر',
        'عدل الصفحة الرئيسية ولا تعدل أي ملف آخر',
        'لا تعدل ملفات أخرى، فقط أنشئ ملف notes.txt فيه كلمة مرحبا',
        'أنشئ ملف notes.txt ولا تعدل أو تحذف أي ملف غيره',
        'Create notes.txt. Do not modify or delete any other file.',
    ])('%s keeps its order: no denial, and its «أي» is «any», not a question', text => {
        expect(reading(text)).toMatchObject({ noFileChanges: false, denial: false });
        expect(isKnowledgeQuestionStructural(text)).toBe(false);
    });

    it('the exclusion is read out of the sentence, and the order stays', () => {
        expect(stripScopedExclusions('غير العنوان ولا تعدل أو تحذف أي ملف آخر').trim()).toBe('غير العنوان');
        expect(stripScopedExclusions('لا تعدل أو تحذف أي ملف').trim()).toBe('لا تعدل أو تحذف أي ملف');
    });
});

describe('a list that only removes or moves forbids that much, and is read as it always was', () => {
    it.each([
        'لا تحذف أي ملف',
        'لا تحذف الملفات القديمة',
        'لا تحذف ولا تنقل أي ملف',
        'لا تحذف أو تمسح شيئا',
        'Do not delete any file',
        'Do not delete or remove any files',
    ])('%s is not a denial of every file change', text => {
        expect(deniesEveryFileChange(text)).toBe(false);
        expect(hasRequestedAction(text).isNoFileChanges).toBe(false);
    });

    it('«لا تعدل، أضف شيئاً جديداً» orders an addition: only verbs make the list', () => {
        expect(reading('لا تعدل، أضف شيئا جديدا')).toMatchObject({ every: false, noFileChanges: false });
    });

    it.each([
        'لا تعدل الملفات',
        'لا تنشئ الملفات',
        'شيك على الكود وقلي وين الغلط، لا تعدل ملفاتي',
        'لا تنشئ ولا تعدل ولا تحذف أي شي',
        'لا تعدل وتحذف وتنقل أي شي',
        'Do not create, edit, delete, move, install, publish, deploy, or commit anything',
        'Do not modify the app files.',
    ])('%s still denies every file change', text => {
        expect(deniesEveryFileChange(text)).toBe(true);
    });
});

describe('the denial readers stay linear', () => {
    const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
    let salt = 0;
    const coldMs = (text: string): number => {
        let best = Infinity;
        for (let i = 0; i < 5; i++) {
            const fresh = `${text} ${++salt}`;
            const t0 = process.hrtime.bigint();
            deniesEveryFileChange(fresh);
            stripScopedExclusions(fresh);
            best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6);
        }
        return Math.max(best, 1);
    };
    const breakers: Array<[string, (n: number) => string]> = [
        ['«لا تعدل أو تحذف أو …» without an object', n => 'لا تعدل ' + rep('أو تحذف ', n)],
        ['«لا تعدل ولا تحذف ولا …»', n => 'لا تعدل ' + rep('ولا تحذف ', n) + 'أي ملف'],
        ['«لا تعدل وتحذف وتنقل …»', n => 'لا تعدل ' + rep('وتحذف ', n) + 'شيئا'],
        ['«لا تحذف، تحذف، …» with no changing verb', n => 'لا تحذف' + rep('، تحذف', n) + ' أي ملف'],
        ['«لا تعدل» repeated', n => rep('لا تعدل ', n) + 'أي ملف'],
        ['«ولا ولا ولا»', n => 'لا تعدل ' + rep('ولا ', n) + 'أي ملف'],
        ['"do not delete or delete or …"', n => 'do not delete ' + rep('or delete ', n) + 'any file'],
        ['"do not modify, modify, …"', n => 'do not modify' + rep(', modify', n) + ' any file'],
        ['"do not delete" repeated', n => rep('do not delete ', n) + 'files'],
        ['spaces after the list', n => 'لا تعدل أو تحذف' + ' '.repeat(n) + 'x'],
    ];
    beforeAll(() => { for (const [, make] of breakers) for (let i = 0; i < 3; i++) coldMs(make(1000)); });

    it.each(breakers)('%s: eight times the text costs about eight times the time', (_label, make) => {
        // A loaded machine makes absolute times say little (the same reading varies tenfold),
        // so the best of five is compared across sizes: a pattern that can cut a list every
        // way takes sixty-four times as long — or minutes — for eight times the text.
        const small = coldMs(make(5000));
        const whole = coldMs(make(40000));
        expect(whole).toBeLessThan(Math.max(20 * small, 600));
        expect(whole).toBeLessThan(5000);
    });
});
