/**
 * ⛔ EVERY READER OF HIS REQUEST ANSWERS IN TIME LINEAR IN ITS LENGTH.
 *
 * The pre-merge review of de86f9f1d timed one regex of the request reader —
 * EVERY_CHANGE_DENIAL_AR, `(?:\s*(?:،|,|أو|او|ولا|و)\s*\S+)+` — on «لا تعدل»
 * followed by 24 «و»-words: 20.7 s. Per call. hasRequestedAction runs 12–14
 * times on every message; one long Arabic message with a list in it would
 * have held Joe for minutes before he read a word. «و» is both a separator
 * and the first letter of the next word, and `\S+` could stop anywhere, so
 * the list could be cut in exponentially many ways.
 *
 * Auditing every reader then found the quieter ones: `negation.*part` took
 * over a second on 5 KB of «لا لا…» or «ولا ولا…» (quadratic: `.*` from every
 * negation), and «do not create a database» followed by a run of spaces was
 * split every way two `\s*` could split it.
 *
 * So each reader in intent-classifier.ts and requested-action.ts is timed
 * here on 5 KB of the inputs that break regexes — runs of «و», commas,
 * spaces, "and", «لا», question marks, quotes, one endless word, long lists.
 * The readers of OTHER files they call (the column reader of app-blueprints,
 * requestedArtifact, normalizeIntentText) are held constant, so the clock
 * reads only what these two files do; their own costs are measured and
 * reported with this change. Each call is cold — the text is new to the
 * reader's memory of its last readings. The best of three must finish in
 * 20 ms for a single-pattern reader (deniesEveryFileChange — the 20.7 s one
 * — stripScopedExclusions, ordersInALaterSentence…: about 1 ms) and in 100 ms
 * for a composite one (hasRequestedAction ~12 ms outside jest, isBuildRequest
 * and its callers 15–35 ms on the development laptop); 100 leaves room for a
 * loaded machine running two jest workers, while every super-linear pattern
 * this file pins took from a second to minutes.
 */
jest.mock('../core/design/app-blueprints', () => ({
    ...jest.requireActual('../core/design/app-blueprints'),
    derivedColumns: () => null,
    columnsAnywhereInHisRequest: () => null,
}));
jest.mock('../core/design/requested-artifact', () => ({
    ...jest.requireActual('../core/design/requested-artifact'),
    requestedArtifact: () => ({ kind: null, needsServer: false, interfaceNamed: false, evidence: { verb: null, object: null, head: null, presentation: false, serverClaims: [] } }),
}));
jest.mock('../core/orchestrator/promptNormalizer', () => ({
    ...jest.requireActual('../core/orchestrator/promptNormalizer'),
    normalizeIntentText: (s: string) => String(s || '').toLowerCase(),
}));

import { hasRequestedAction, deniesEveryFileChange, stripScopedExclusions, withoutDefiniteVerbalNouns, ordersInALaterSentence, LATER_BUILD_ORDER, LATER_DEED_ORDER } from '../core/intelligence/requested-action';
import { isBuildRequest, isKnowledgeQuestionStructural, isReadOnlyStructural, isWebOrder, isBrowserRequest, asksForAThingThatHolds } from '../core/intelligence/intent-classifier';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const SIZE = 5000;
const BUDGET_MS = 100;
const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);

const inputs: Array<[string, (n: number) => string]> = [
    ['«و»-words after «لا تعدل» (the 20.7 s case)', n => 'لا تعدل ' + rep('والمواعيد ', n) + ' الآن.'],
    ['«ولا ولا ولا»', n => 'لا تعدل ' + rep('ولا ', n) + ' أي شي'],
    ['«و و و»', n => rep('و ', n)],
    ['«،» after «لا تعدل»', n => 'لا تعدل ' + rep('، ', n)],
    ['commas after "do not change"', n => 'Do not change ' + rep(', ', n) + 'anything'],
    ['spaces after an exclusion', n => 'Build a todo app. Do not create a database' + ' '.repeat(n) + 'x'],
    ['"and and and"', n => 'Do not create ' + rep('and ', n) + 'anything'],
    ['"or or or" after a part', n => 'do not create a database ' + rep('or ', n)],
    ['"then then" after a question', n => 'What is X? ' + rep('then ', n)],
    ['courtesy words after a question', n => 'كيف أنشر؟ ' + rep('ثم الآن من فضلك طيب، ', n)],
    ['«do not change the» … files', n => rep('do not change the ', n) + ' files'],
    ['«لا تعدل الملفات» repeated', n => rep('لا تعدل الملفات ', n)],
    ['«لا لا لا»', n => rep('لا ', n)],
    ['"no no no"', n => rep('no ', n)],
    ['"explain … then" repeated', n => rep('explain the approach then ', n)],
    ['«اشرح ثم» repeated', n => rep('اشرح ثم ', n)],
    ['a long English list', n => 'I want a table with ' + rep('name, ', n) + 'and phone'],
    ['a long Arabic list', n => 'بدي جدول فيه ' + rep('الاسم و', n) + 'الهاتف'],
    ['question marks', n => rep('ما هذا؟ ', n)],
    ['«ابني ابني» after a question', n => 'كيف أربي ابني؟ ' + rep('ابني ', n)],
    ['unbalanced quotes', n => rep('"a ', n)],
    ['apostrophes', n => rep(" 'a", n)],
    ['"without creating" repeated', n => rep('without creating ', n)],
    ['«بدون بناء» repeated', n => rep('بدون بناء ', n)],
    ['one endless word', n => 'لا تعدل و' + rep('ب', n)],
    ['punctuation then a word after a question', n => 'What? Deploy ' + rep('!', n) + 'a'],
    ['an Arabic titled list', n => 'نظام فواتير: ' + rep('تقارير، ', n)],
    ['an English titled list', n => 'A system: ' + rep('a, ', n)],
    ['Arabic prose', n => rep('عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد. ', n)],
    ['English prose', n => rep('Build a REST API for todos. Do not create a frontend. Then run the tests and report. ', n)],
    ['a site as a model', n => 'Build ' + rep('like youtube ', n)],
    ['«تسجيل الدخول» repeated', n => rep('أصلح خطأ تسجيل الدخول ', n)],
    ['new lines', n => rep('a\n', n)],
];

/** The single-pattern readers (the 20.7 s one among them) must stay under the review's own 20 ms. */
const PATTERN_BUDGET_MS = 20;
const singlePattern = new Set(['deniesEveryFileChange', 'stripScopedExclusions', 'withoutDefiniteVerbalNouns', 'ordersInALaterSentence (deeds)', 'ordersInALaterSentence (builds)']);
const readers: Array<[string, (text: string) => unknown]> = [
    ['hasRequestedAction', hasRequestedAction],
    ['deniesEveryFileChange', deniesEveryFileChange],
    ['stripScopedExclusions', stripScopedExclusions],
    ['withoutDefiniteVerbalNouns', withoutDefiniteVerbalNouns],
    ['ordersInALaterSentence (deeds)', t => ordersInALaterSentence(t, LATER_DEED_ORDER)],
    ['ordersInALaterSentence (builds)', t => ordersInALaterSentence(t, LATER_BUILD_ORDER, true)],
    ['isBuildRequest', isBuildRequest],
    ['isKnowledgeQuestionStructural', isKnowledgeQuestionStructural],
    ['isReadOnlyStructural', isReadOnlyStructural],
    ['isWebOrder', isWebOrder],
    ['isBrowserRequest', isBrowserRequest],
    ['asksForAThingThatHolds', asksForAThingThatHolds],
];

let salt = 0;
/** A cold call: the text is new to every reader's memory of its last readings. */
function coldMs(read: (text: string) => unknown, text: string): number {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
        const fresh = `${text} ${++salt}`;
        const t0 = process.hrtime.bigint();
        read(fresh);
        best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return best;
}

describe(`every request reader stays under ${BUDGET_MS} ms on ${SIZE / 1000} KB of what breaks regexes`, () => {
    // Warm: a regex runs interpreted until it has run a few times.
    beforeAll(() => { for (let i = 0; i < 3; i++) for (const [, read] of readers) for (const [, make] of inputs) read(`${make(1000)} ${i}`); });

    test.each(inputs)('%s', (_label, make) => {
        const text = make(SIZE);
        const slow = readers
            .map(([name, read]) => [name, coldMs(read, text)] as const)
            .filter(([name, ms]) => ms > (singlePattern.has(name) ? PATTERN_BUDGET_MS : BUDGET_MS))
            .map(([name, ms]) => `${name} ${ms.toFixed(1)} ms`);
        expect(slow).toEqual([]);
    });

    /*
     * The build gate on every request, at 5 KB and 20 KB: the planner's
     * measurement found isBuildRequest at 5.1 s (5 KB) and 16.7 s (20 KB) on
     * «انشر مقال المحتوى خبر …», 26.5 s (20 KB) on «لا لا …». The quadratic
     * `negation.*part`, the explain-then-build scan and the column reader run
     * for every message (now only when he asks for something) were this
     * file's share; normalizeIntentText's word walk and requestedArtifact are
     * the rest, held constant here and fixed in their own files. Linear means
     * the 20 KB call costs about four 5 KB ones: under 50 ms and 200 ms
     * measured, asserted at twice that for a loaded machine.
     */
    const gate: Array<[string, (text: string) => unknown]> = [
        ['isBuildRequest', isBuildRequest],
        ['isKnowledgeQuestionStructural', isKnowledgeQuestionStructural],
        ['hasRequestedAction', hasRequestedAction],
        ['isBrowserRequest', isBrowserRequest],
        ['PlanningEngine.looksLikeBuild', t => PlanningEngine.looksLikeBuild(t)],
    ];
    const gateInputs: Array<[string, string]> = [
        ['«انشر مقال المحتوى خبر»', 'انشر مقال المحتوى خبر '],
        ['«لا »', 'لا '],
        ['«و»', 'و '],
        ['", "', ', '],
        ['"and "', 'and '],
        ['"a "', 'a '],
        ['"build a a a"', 'build a a a '],
        ['diacritics-heavy Arabic', 'اِبْنِ لِي مَوْقِعًا لِمَطْعَمِي، وَأَضِفْ صَفْحَةً لِلْحَجْزِ '],
    ];
    test.each(gateInputs)('the build gate on %s: < 100 ms at 5 KB, < 400 ms at 20 KB', (_label, unit) => {
        for (const [, read] of gate) for (let i = 0; i < 3; i++) read(`${rep(unit, 1000)} warm${i}`);
        const slow: string[] = [];
        for (const [size, budget] of [[5000, 100], [20000, 400]] as const) {
            const text = rep(unit, size);
            for (const [name, read] of gate) {
                const ms = coldMs(read, text);
                if (ms > budget) slow.push(`${name} ${ms.toFixed(1)} ms at ${size / 1000} KB`);
            }
        }
        expect(slow).toEqual([]);
    });

    test('the 20.7 s list is still read: a list of changes denied together denies every file change', () => {
        expect(deniesEveryFileChange('لا تنشئ ولا تعدل ولا تحذف أي شي')).toBe(true);
        expect(deniesEveryFileChange('لا تنشئ او تعدل او تحذف اي شي')).toBe(true);
        expect(deniesEveryFileChange('لا تعدل، تحذف، تنشئ أي شيء')).toBe(true);
        expect(deniesEveryFileChange('لا تعدل وتحذف وتنقل أي شي')).toBe(true);
        expect(deniesEveryFileChange('Do not create, edit, delete, move, install, publish, deploy, or commit anything')).toBe(true);
    });
});
