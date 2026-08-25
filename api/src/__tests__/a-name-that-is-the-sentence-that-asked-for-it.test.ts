/**
 *  A NAME THAT IS THE SENTENCE THAT ASKED FOR IT.
 *
 *  Read out of a real reply on his own machine:
 *
 *      🧠 A working application, not a page about one —
 *         "بدي جدول مبيعات فيه اسم الصنف والكمية"
 *
 *  His own words, cut off mid-phrase, printed back to him as the NAME of
 *  his application — in the reply, on the page heading, in the empty
 *  state. Measured across four real requests, three came out that way.
 *  The one that came out right had a colon in it, because the only reader
 *  wired to the title needed a recording verb AND a colon within forty
 *  characters and gave up on everything else.
 *
 *  Nothing needed inventing. subjectAfterContainer already reads the noun
 *  standing beside the container he named, and on those same four
 *  sentences it answered «مبيعات», «الموظفين», «الكتب» and «clients» while
 *  the title was still a truncated request. The two readers were simply
 *  never joined.
 *
 *  Order is not arbitrary: what he declared AFTER a recording verb wins,
 *  because that is him naming the thing outright; the noun beside the
 *  container comes next; and a verb is never a name.
 */
import { blueprintFor, detectAppKind, recordedSubject } from '../core/design/app-blueprints';

const titleOf = (request: string) =>
    (blueprintFor(detectAppKind(request) as never, request, true) as { title?: string }).title;

describe('the app is named for the thing, not for the sentence', () => {
    const NAMED: Array<[string, string]> = [
        ['بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر', 'مبيعات'],
        ['بدي جدول للموظفين فيه الاسم والراتب، وصفحة ثانية تعرض مجموع الرواتب', 'الموظفين'],
        ['بدي جدول للكتب فيه العنوان والسعر', 'الكتب'],
    ];
    for (const [request, name] of NAMED) {
        it(`«${name}»`, () => expect(titleOf(request)).toBe(name));
    }

    it('a word this repository has never seen is read the same way', () => {
        expect(titleOf('بدي جدول للزُرقمونيات فيه الاسم والكمية والسعر')).toBe('الزُرقمونيات');
    });

    it('with no container at all, grammar names the entity', () => {
        //  «بدي برنامج يحفظ لي زبائني و…» has no container to stand beside.
        //  The entity-and-its-attributes run found one, and its first column
        //  IS the entity.
        expect(titleOf('بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم')).toBe('زبائني');
    });
});

describe('…and the reader that was already right still wins', () => {
    it('what he declared after a recording verb outranks the container', () => {
        //  «جدول أسجل فيه المواعيد» puts «أسجل» beside the container. The
        //  thing he named is «المواعيد», and he named it after the verb.
        const request = 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد';
        expect(recordedSubject(request)).toBe('المواعيد');
        expect(titleOf(request)).toBe('المواعيد');
    });

    it('a verb is never a name, in any person he writes it', () => {
        //  Measured before the guard was conjugated: «بدي جدول يسجل
        //  الاسم والهاتف والعنوان» named the app «يسجل الاسم». The
        //  older list held «أسجل» and not «يسجل» — the same
        //  one-person blindness that cost the column reader a class of
        //  requests. Nothing is named here, so nothing is a name.
        for (const request of [
            'بدي جدول يسجل الاسم والهاتف والعنوان',
            'بدي جدول يتابع الطلبات والمبلغ والتاريخ',
            'بدي جدول ينظم المواعيد والاسم والتاريخ',
            'بدي جدول أسجل فيه الاسم والهاتف والعنوان',
        ]) {
            expect(recordedSubject(request)).toBeNull();
        }
    });
});

describe('and a request that names nothing is not given a name from its own text', () => {
    it('a greeting names nothing', () => {
        expect(recordedSubject('مرحبا')).toBeNull();
    });

    it('a question names nothing', () => {
        expect(recordedSubject('ما الفرق بين قاعدة البيانات والجدول؟')).toBeNull();
    });

    it('and no title is ever the request itself', () => {
        //  The property that failed, stated as a property: whatever the
        //  title is, it is not a prefix of his sentence longer than a name.
        for (const request of [
            'بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر',
            'بدي جدول للموظفين فيه الاسم والراتب، وصفحة ثانية تعرض مجموع الرواتب',
            'بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم',
        ]) {
            const title = String(titleOf(request) || '');
            expect(request.startsWith(title)).toBe(false);
            expect(title.split(/\s+/).length).toBeLessThanOrEqual(3);
        }
    });
});
