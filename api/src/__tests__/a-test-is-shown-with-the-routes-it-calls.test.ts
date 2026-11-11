/**
 * ⛔ A TEST THAT CALLS A ROUTE IS SHOWN WITH THE FILE THAT ANSWERS IT.
 *
 * The hard exam, 2026-11-04, H02: a school of 22 files, too big to show whole.
 * «جدول حصص بلا تعارض» was judged eight times, and every time the judge said
 * what it saw: «the tests expect the clash refused with 409, but
 * src/modules/timetable.js, which does it, is not shown». His words were in
 * the tests and the page; the module that keeps the rule holds its logic in
 * code and its messages in other words («الصف لديه حصة أخرى»), and no function
 * of it is called by name — the tests reach it over HTTP.
 *
 * A file shown to the judge brings the server file that registers each route
 * it calls, by the route's fixed part — the route called nearest his words
 * first: the tests call every route, and in H02 the modules taken in file
 * order filled the slice before timetable.js.
 */
import { judgeSourceOf, MAX_SOURCE_CHARS, sliceFor, type NamedRequirement } from '../core/quality/named-requirements';

const NO_CLASH: NamedRequirement = { id: 'no-clash', text: 'جدول حصص بلا تعارض', quote: 'جدول حصص بلا تعارض' } as NamedRequirement;

/** Pages that say «جدول» everywhere and keep no rule. */
const page = (i: number) => ({
    path: `public/page${i}.js`,
    text: Array.from({ length: 30 }, (_, k) => `document.querySelector('#row${k}').textContent = 'جدول اليوم ${i}-${k}';`).join('\n'),
});

const TESTS = {
    path: 'tests/api.test.js',
    text: [
        `import test from 'node:test';`,
        `test('grades are listed', async () => {`,
        `  const grades = await call('GET', '/api/grades');`,
        `  assert.equal(grades.status, 200);`,
        `});`,
        ...Array.from({ length: 20 }, (_, k) => `// fixture ${k}: a student, a class and a teacher for the suites below`),
        `test('جدول الحصص يرفض التعارض', async () => {`,
        `  const first = await call('POST', '/api/timetable', { classId: 1, teacherId: 1, day: 0, slot: 1 });`,
        `  const clash = await call('POST', '/api/timetable', { classId: 1, teacherId: 2, day: 0, slot: 1 });`,
        `  assert.equal(clash.status, 409);`,
        `  await call('DELETE', \`/api/timetable/\${first.body.id}\`);`,
        `});`,
    ].join('\n'),
};

/** The rule, in a module whose words are not his. */
const TIMETABLE = {
    path: 'src/modules/timetable.js',
    text: [
        `export function defineTimetable(ctx) {`,
        `  const { api, ADMIN, get, fail } = ctx;`,
        ...Array.from({ length: 40 }, (_, k) => `  const column${k} = 'c${k}'; // bookkeeping`),
        `  api.post('/api/timetable', ADMIN, ({ body }) => {`,
        `    const busy = get('SELECT id FROM timetable WHERE class_id = ? AND day = ? AND slot = ?', body.classId, body.day, body.slot);`,
        `    if (busy) fail(409, 'الصف لديه حصة أخرى في هذا الوقت'); // rule-kept-marker`,
        `    return insert(body);`,
        `  });`,
        `  api.delete('/api/timetable/:id', ADMIN, ({ params }) => remove(params.id));`,
        `}`,
    ].join('\n'),
};

/** A route the tests call far from his words, in a module too big to show beside the rule. */
const GRADES = {
    path: 'src/modules/grades.js',
    text: [
        `export function defineGrades(ctx) {`,
        ...Array.from({ length: 900 }, (_, k) => `  const weight${k} = ${k}; // grade bookkeeping`),
        `  ctx.api.get('/api/grades', null, () => ctx.all('SELECT * FROM grades'));`,
        `}`,
    ].join('\n'),
};

/** A route nobody calls. */
const ATTENDANCE = { path: 'src/modules/attendance.js', text: `export function defineAttendance(ctx) {\n  ctx.api.get('/api/attendance', null, () => ctx.all('SELECT * FROM attendance'));\n}` };

//  The far route's module first, as file order would take it.
const files = [...Array.from({ length: 24 }, (_, i) => page(i)), TESTS, GRADES, TIMETABLE, ATTENDANCE];
const source = judgeSourceOf(files);

describe('a project too big to show whole, judged on a rule its tests reach over HTTP', () => {
    it('is big enough to be cut', () => {
        expect(source.length).toBeGreaterThan(MAX_SOURCE_CHARS);
    });

    it('the tests are shown with the module that answers the route they call', () => {
        const shown = sliceFor(NO_CLASH, source);
        expect(shown.length).toBeLessThanOrEqual(MAX_SOURCE_CHARS);
        expect(shown).toContain(TESTS.text);
        expect(shown).toContain(TIMETABLE.text);
        expect(shown).toContain('rule-kept-marker');
    });

    it('the route called nearest his words comes before the one called far from them', () => {
        expect(GRADES.text.length + TIMETABLE.text.length + TESTS.text.length).toBeGreaterThan(MAX_SOURCE_CHARS);
        expect(sliceFor(NO_CLASH, source)).not.toContain(GRADES.text);
    });

    it('a route nobody shown calls brings nothing', () => {
        expect(sliceFor(NO_CLASH, source)).not.toContain(ATTENDANCE.text);
    });
});
