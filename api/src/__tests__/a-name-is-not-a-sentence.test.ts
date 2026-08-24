/**
 *  A NAME IS NOT A SENTENCE.
 *
 *  Measured live on his machine. He asked:
 *
 *      «بدي جدول للموظفين فيه الاسم والراتب والقسم، وصفحة ثانية تعرض
 *       مجموع الرواتب»
 *
 *  and the project shipped in a folder called:
 *
 *      react-بدي-جدول-للموظفين-فيه-الاسم-والر
 *
 *  His whole request, hyphenated and cut off at thirty-two characters —
 *  and in the same run the reader had already answered «مشروع الموظفين»
 *  when asked what the project was called. The right name existed and was
 *  ignored, because the tool takes whatever `projectName` the planner
 *  hands it and slugs it without asking whether it is a name at all.
 *
 *  THE TEST IS SHAPE, AND IT NEEDS NO VOCABULARY. A name someone CHOSE
 *  does not begin the sentence it came from: «Gate062» does not open
 *  «Build a small project called Gate062», while «بدي جدول للموظفين…»
 *  is exactly the opening of «بدي جدول للموظفين…». A candidate whose slug
 *  is a PREFIX of the request's slug is the request wearing a name's
 *  clothes.
 *
 *  Not one business word appears in the rule, and none should.
 */

import { projectDirNameForTest } from '../modules/tools/definitions/ReactProjectTool';

describe('a name someone chose is kept', () => {
    //  POSITIVE — every one of these is a real name from a real request,
    //  and a guard that rejected any of them would be worse than the defect.
    it.each([
        ['Gate062', 'Gate 062', 'Build a small project called Gate062. Create one polished page titled Gate 062', 'react-gate062'],
        ['SpendWise', 'SpendWise', 'Build a React expense tracker called SpendWise with amount, category and date', 'react-spendwise'],
        ['عيادة أسنان', 'عيادة أسنان', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه', 'react-عيادة-أسنان'],
        ['FocusBoard', 'FocusBoard', 'Build a polished React task manager called FocusBoard for one user', 'react-focusboard'],
    ])('%s survives', (name, brand, request, expected) => {
        expect(projectDirNameForTest(name, brand, request)).toBe(expected);
    });

    //  POSITIVE — an already-prefixed name is not prefixed twice.
    it('does not write react-react-', () => {
        expect(projectDirNameForTest('react-gate062', 'Gate 062', 'Build Gate062')).toBe('react-gate062');
    });
});

describe('a name is made of words he wrote', () => {
    /**
     *  Found by a live ladder run, walking straight through the first version
     *  of this guard:
     *
     *      «بدي جدول للكتب: العنوان والمؤلف والسعر»   -> react-the-d34e34be
     *      «بدي جدول للكتب فيه العنوان والمؤلف والسعر» -> react-كتب-works-417308d5
     *
     *  «the» and «works» are not words he said, and «the» is three characters
     *  so it never even reached the prefix test. Measured at the same moment,
     *  brandFallback answered «مشروع الكتب» for both.
     */
    it.each([
        ['The', 'بدي جدول للكتب: العنوان والمؤلف والسعر'],
        ['كتب Works', 'بدي جدول للكتب فيه العنوان والمؤلف والسعر'],
        ['MyAwesomeApp', 'بدي جدول للمصاريف: التاريخ والمبلغ'],
        ['Untitled', 'بدي جدول للطلاب فيه الاسم والصف'],
    ])('«%s» is the planner talking, not him', (candidate, request) => {
        const got = projectDirNameForTest(candidate, 'مشروع الكتب', request);
        expect(got).toBe('react-مشروع-الكتب');
    });

    //  POSITIVE — and Arabic attaches its articles, so «كتب» has to be found
    //  inside «للكتب» or every Arabic name he chooses is refused.
    it('finds his word under its article', () => {
        expect(projectDirNameForTest('الكتب', 'x', 'بدي جدول للكتب فيه العنوان')).toBe('react-الكتب');
        expect(projectDirNameForTest('كتب', 'x', 'بدي جدول للكتب فيه العنوان')).toBe('react-كتب');
    });

    //  NEGATIVE — a test that cannot run must not reject: with no request to
    //  compare against, the candidate is taken as given.
    it('does not refuse a name when there is nothing to compare it to', () => {
        expect(projectDirNameForTest('Gate062', 'brand', '')).toBe('react-gate062');
    });
});

describe('a sentence handed in as a name is refused', () => {
    //  NEGATIVE — his exact case, and the folder he actually got.
    it('his employees request does not become the folder name', () => {
        const request = 'بدي جدول للموظفين فيه الاسم والراتب والقسم، وصفحة ثانية تعرض مجموع الرواتب';
        const got = projectDirNameForTest(request, 'مشروع الموظفين', request);
        expect(got).toBe('react-مشروع-الموظفين');
        expect(got).not.toContain('بدي');
    });

    //  NEGATIVE — the opening words alone, which is what a planner hands
    //  back when it truncates rather than names.
    it.each([
        ['بدي جدول للموظفين', 'بدي جدول للموظفين فيه الاسم والراتب والقسم'],
        ['Build a small project', 'Build a small project called Gate062'],
        ['بدي جدول للمصاريف', 'بدي جدول للمصاريف: التاريخ والمبلغ والسبب'],
    ])('«%s» is the start of the sentence, not a name for it', (candidate, request) => {
        const got = projectDirNameForTest(candidate, 'المشروع', request);
        expect(got).toBe('react-المشروع');
    });

    //  NEGATIVE — prose that is not the opening words is still prose.
    it('a long phrase is not a name however it starts', () => {
        expect(projectDirNameForTest('a table of employees and their salaries and departments', 'Staff', 'unrelated request'))
            .toBe('react-staff');
    });

    //  NEGATIVE — punctuation belongs to sentences.
    it.each(['المواعيد: الاسم', 'name, phone', 'الاسم؛ الراتب'])('«%s» carries a sentence mark', (candidate) => {
        expect(projectDirNameForTest(candidate, 'Staff', 'unrelated')).toBe('react-staff');
    });

    //  NEGATIVE — and with nothing usable at either end, it still produces a
    //  directory rather than an empty path.
    it('falls all the way back rather than returning nothing', () => {
        expect(projectDirNameForTest('', '', '')).toBe('react-app');
    });
});
