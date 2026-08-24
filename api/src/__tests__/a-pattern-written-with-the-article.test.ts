/**
 *  A PATTERN WRITTEN WITH THE ARTICLE MATCHES HALF THE LANGUAGE.
 *
 *  Measured on the ladder:
 *
 *      «بدي جدول للموظفين فيه الاسم والراتب، وصفحة ثانية تعرض مجموع الرواتب»
 *      → criteria: عمود «الاسم» · عمود «الراتب»
 *
 *  He asked to be shown a total and NO criterion was written for it. Not a
 *  criterion that failed — one that was never there, which Joe can report
 *  success around without ever having shown him a total.
 *
 *  The cause: «المجموع» was written into the pattern with its article, and
 *  a longer string cannot match a shorter one. «مجموع الرواتب» is how a
 *  man actually writes it. The same trap sat on «العدد» beside it.
 *
 *  «ال» is a PREFIX. A pattern written bare matches both forms and a
 *  pattern written with the article matches one, so writing the article
 *  into an `asked` pattern is never right — it can only ever subtract.
 *  Every other entry in that catalogue was already written bare, which is
 *  why only these two were blind.
 *
 *  This guard is a property over the whole catalogue rather than a case:
 *  it walks each capability in both forms, so the next entry written with
 *  an article fails here instead of in a live round.
 */
import { acceptanceFor } from '../core/quality/acceptance';

const asked = (id: string, phrase: string) =>
    acceptanceFor(`بدي جدول للموظفين فيه الاسم والراتب والقسم، و${phrase}`).some(c => c.id === id);

//  [criterion, how he writes it bare, how he writes it with «ال»]
const BOTH_FORMS: Array<[string, string, string]> = [
    ['counter', 'مجموع الرواتب', 'المجموع'],
    ['counter', 'إجمالي الرواتب', 'الإجمالي'],
    ['counter', 'عدد الصفوف', 'العدد'],
    ['counter', 'عداد للصفوف', 'العداد'],
    ['search', 'بحث بالاسم', 'البحث'],
    ['filter', 'تصفية بالقسم', 'التصفية'],
    ['export', 'تصدير للملف', 'التصدير'],
    ['preview', 'معاينة حيّة', 'المعاينة'],
    ['dashboard', 'مؤشرات للأداء', 'المؤشرات'],
    ['button', 'زر للحفظ', 'الزر'],
    ['title', 'عنوان للصفحة', 'العنوان'],
];

describe('every capability is recognised in both forms of its own word', () => {
    for (const [id, bare, withArticle] of BOTH_FORMS) {
        it(`«${bare}» asks for ${id}`, () => expect(asked(id, bare)).toBe(true));
        it(`«${withArticle}» asks for ${id}`, () => expect(asked(id, withArticle)).toBe(true));
    }
});

describe('the sentence that found it', () => {
    it('a second page showing a total now carries a total criterion', () => {
        const ids = acceptanceFor('بدي جدول للموظفين فيه الاسم والراتب، وصفحة ثانية تعرض مجموع الرواتب')
            .map(c => c.id);
        expect(ids).toContain('counter');
        expect(ids).toContain('column:text1');
    });
});

describe('…and a word nobody asked for still asks for nothing', () => {
    it('a plain table asks for no total', () => {
        expect(acceptanceFor('بدي جدول للموظفين فيه الاسم والراتب والقسم').map(c => c.id))
            .not.toContain('counter');
    });

    it('a plain table asks for no search', () => {
        expect(acceptanceFor('بدي جدول للموظفين فيه الاسم والراتب والقسم').map(c => c.id))
            .not.toContain('search');
    });

    it('a plain table asks for no export', () => {
        expect(acceptanceFor('بدي جدول للموظفين فيه الاسم والراتب والقسم').map(c => c.id))
            .not.toContain('export');
    });
});
