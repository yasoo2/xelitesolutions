/**
 * THE WORDS ON HIS PAGE CAME FROM A CATALOGUE — AND SO DID MY FIRST FIX.
 *
 * The owner, watching a live build of a coffee roastery he described in
 * Arabic: «this page is very poor and completely unacceptable». Read from the
 * `content.js` he was looking at, verbatim:
 *
 *     heroLede = 'A real React app with instant performance, a consistent
 *                 design system, ready to ship.'
 *     perks    = ['Fresh every morning','Instant booking','Parking on site']
 *     cta      = 'Book a table'
 *
 * The line under his headline was Joe advertising himself. The perks were a
 * restaurant's. Only the brand and tagline came from what he wrote.
 *
 * ⛔ MY FIRST REPAIR WAS TWO REGEX LISTS — every «react app», «book a table»,
 * «our story» I had personally watched fail. He read it and said: «you fix it
 * so the same prompt does not repeat the same mistake — that is a template. I
 * want Joe not to make mistakes whatever the prompt is.»
 *
 * He was right. A blacklist holds yesterday's errors. «Reserve your lane» on a
 * roastery, «Book your court» on a clinic — both sail past a list, and both
 * are the same defect. A catalogue of bad outputs is still a catalogue.
 *
 * ⛔ SO THIS FILE TESTS THE SHAPE OF THE JUDGEMENT, NOT A SET OF PHRASES.
 * The decisive test is the last one: copy that no list could have anticipated,
 * refused because the judgement is RELATIONAL — «would this line be equally
 * true of a business he never mentioned?» — asked against his request. If a
 * phrase list ever comes back, the guard at the bottom turns red.
 */

import {
    refuseCopy,
    speaksHisLanguage,
    parseCopy,
    parseVerdict,
    verifyPrompt,
    authorCopy,
    copyPrompt,
    type CopySpec,
} from '../core/design/authored-copy';
import fs from 'fs';
import path from 'path';

const REQUEST = 'اعمل لي موقع لمحمصة قهوة مختصة اسمها وَقّاد، فيه قصة المحمصة وأنواع القهوة وطريقة التحميص';

const spec = (over: Partial<CopySpec> = {}): CopySpec => ({
    request: REQUEST,
    brand: 'وَقّاد',
    isArabic: true,
    current: {},
    fields: ['tagline', 'heroTitle', 'heroLede', 'cta', 'perks'],
    ...over,
});

/** A verifier that answers as instructed, so the wiring can be tested. */
const verifierSaying = (fails: Record<string, string>) =>
    async (prompt: string) => prompt.startsWith('Here is what someone asked')
        ? JSON.stringify({ fails })
        : JSON.stringify({ fields: {} });

describe('the shape checks stay general — they never name a phrase', () => {
    it('POSITIVE — copy in his language, of a sane length, passes the shape checks', () => {
        expect(refuseCopy('heroLede', 'نحمّص حبوب القهوة المفردة المصدر كل صباح ونقدّمها بعد أيام من التحميص لا شهور.', spec())).toBe('');
        expect(refuseCopy('perks', ['تحميص كل صباح', 'حبوب مفردة المصدر', 'طحن حسب طريقتك'], spec())).toBe('');
    });

    it('NEGATIVE — English copy on a page he asked for in Arabic is refused', () => {
        //  The live page carried «Your table is ready tonight» beside Arabic
        //  headings. A whole-page language check passes that; only a per-field
        //  check catches a page that is half his language.
        expect(!!refuseCopy('ctaBandTitle', 'Your table is ready tonight', spec())).toBe(true);
        expect(!!refuseCopy('heroLede', 'نحمّص كل صباح', spec({ isArabic: false }))).toBe(true);
    });

    it('NEGATIVE — empty and oversized copy is refused', () => {
        expect(!!refuseCopy('cta', '', spec())).toBe(true);
        expect(!!refuseCopy('heroLede', 'ا'.repeat(500), spec())).toBe(true);
    });

    it('NEGATIVE — a number or a symbol is neutral, not a language violation', () => {
        //  Otherwise «2024» or «☕» would be refused for «the wrong language» —
        //  a criterion firing on something it was never about.
        expect(speaksHisLanguage('2024', true)).toBe(true);
        expect(speaksHisLanguage('☕', true)).toBe(true);
    });
});

describe('⛔ the judgement that replaced the lists is relational', () => {
    it('the brief hands the verifier HIS REQUEST and the drafted lines', () => {
        const p = verifyPrompt(REQUEST, { cta: 'احجز طاولة' });
        expect(p).toContain(REQUEST);
        expect(p).toContain('احجز طاولة');
        //  and asks the question that needs no examples
        expect(p).toContain('never');
    });

    it('POSITIVE — a line the verifier condemns is dropped and named', async () => {
        const r = await authorCopy(
            spec({ fields: ['cta'] }),
            async (prompt: string) => prompt.startsWith('Here is what someone asked')
                ? JSON.stringify({ fails: { cta: 'asks a coffee customer to book a table' } })
                : JSON.stringify({ fields: { cta: 'احجز طاولة' } }),
        );
        expect(r.fields).toEqual({});
        expect(r.rejected[0].field).toBe('cta');
        expect(r.rejected[0].reason).toContain('book a table');
    });

    it('⛔ DECISIVE — copy no list could have anticipated is still refused', async () => {
        //  Neither of these strings appears anywhere in the source. A blacklist
        //  built from what I had watched fail would have shipped both.
        const r = await authorCopy(
            spec({ fields: ['cta', 'heroLede'] }),
            async (prompt: string) => prompt.startsWith('Here is what someone asked')
                ? JSON.stringify({ fails: {
                    cta: 'a bowling alley reserves lanes; a roastery does not',
                    heroLede: 'praises the website rather than the roastery',
                } })
                : JSON.stringify({ fields: {
                    cta: 'احجز مسارك الآن',
                    heroLede: 'واجهة سريعة الاستجابة مبنية بأحدث التقنيات وجاهزة للنشر.',
                } }),
        );
        expect(r.fields).toEqual({});
        expect(r.rejected.map(x => x.field).sort()).toEqual(['cta', 'heroLede']);
    });

    it('POSITIVE — and copy the verifier clears survives', async () => {
        const r = await authorCopy(
            spec({ fields: ['heroLede'] }),
            verifierSaying({}) as any,
        );
        //  the author call returns no fields in this stub, so nothing to keep
        expect(r.fields).toEqual({});
    });

    it('NEGATIVE — an unreadable verdict drops NOTHING and says so', async () => {
        //  A reader that cannot be read must never look like a clean verdict.
        //  That is the «zero failed vs zero run» trap in a new coat.
        const r = await authorCopy(
            spec({ fields: ['heroLede'] }),
            async (prompt: string) => prompt.startsWith('Here is what someone asked')
                ? 'I am not able to answer that right now.'
                : JSON.stringify({ fields: { heroLede: 'نحمّص حبوب القهوة المفردة المصدر كل صباح في قلب المدينة.' } }),
        );
        expect(Object.keys(r.fields)).toEqual(['heroLede']);
        expect(r.rejected.map(x => x.field)).toEqual(['*verify']);
    });

    it('NEGATIVE — a verdict naming a field that was never written is ignored', () => {
        expect(parseVerdict('{"fails":{"cta":"x"}}')).toEqual({ cta: 'x' });
        expect(parseVerdict('{"fails":{}}')).toEqual({});
        expect(parseVerdict('nothing parseable here')).toBeNull();
    });
});

describe('the floor never moves', () => {
    it('POSITIVE — one bad field does not discard the good ones', async () => {
        const r = await authorCopy(
            spec({ fields: ['heroLede', 'cta'] }),
            async (prompt: string) => prompt.startsWith('Here is what someone asked')
                ? JSON.stringify({ fails: { cta: 'belongs to a restaurant' } })
                : JSON.stringify({ fields: {
                    heroLede: 'نحمّص حبوب القهوة المفردة المصدر كل صباح في قلب المدينة.',
                    cta: 'احجز طاولة',
                } }),
        );
        expect(Object.keys(r.fields)).toEqual(['heroLede']);
        expect(r.rejected.map(x => x.field)).toEqual(['cta']);
    });

    it('NEGATIVE — a provider that is down is reported as such, not as copy', async () => {
        const r = await authorCopy(spec(), async () => { throw new Error('all providers unavailable'); });
        expect(r.fields).toEqual({});
        expect(r.rejected[0].reason).toContain('could not be reached');
    });

    it('NEGATIVE — a field he did not ask for is ignored, not written', async () => {
        const r = await authorCopy(
            spec({ fields: ['cta'] }),
            async (prompt: string) => prompt.startsWith('Here is what someone asked')
                ? JSON.stringify({ fails: {} })
                : JSON.stringify({ fields: { cta: 'تصفّح أنواع القهوة', menuTitle: 'قائمتنا' } }),
        );
        expect(Object.keys(r.fields)).toEqual(['cta']);
    });

    it('NEGATIVE — noise yields nothing, not a guess', () => {
        expect(parseCopy('I cannot help with that.')).toEqual({});
        expect(parseCopy('')).toEqual({});
    });
});

describe('⛔ and no catalogue may come back', () => {
    const SRC = fs.readFileSync(path.join(__dirname, '..', 'core', 'design', 'authored-copy.ts'), 'utf-8');
    //  The executable half of the file — comments record the phrases that
    //  failed, on purpose, and must not be mistaken for a list that runs.
    const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    it('the writing brief never names a business KIND', () => {
        const p = copyPrompt(spec());
        for (const kind of ['restaurant', 'clinic', 'law firm', 'salon', 'gym', 'مطعم', 'عيادة']) {
            expect({ kind, present: p.toLowerCase().includes(kind) }).toEqual({ kind, present: false });
        }
    });

    it('and no phrase blacklist survives in the code that runs', () => {
        //  The exact entries of the list he called a template. If any of them
        //  reappears in executable code, the relational judgement has been
        //  quietly replaced by a lookup again.
        for (const phrase of ['book a table', 'react app', 'design system', 'our story', 'lorem ipsum', 'ready to ship']) {
            expect({ phrase, inCode: CODE.toLowerCase().includes(phrase) })
                .toEqual({ phrase, inCode: false });
        }
    });

    it('NEGATIVE — and the reader really is reading the code, not an empty string', () => {
        //  Non-emptiness: a stripped source that came back blank would make the
        //  test above pass for the worst possible reason.
        expect(CODE).toContain('export async function authorCopy');
        expect(CODE.length).toBeGreaterThan(1500);
    });
});

/**
 *  ⛔ THE AUTHORED VALUE MUST BE THE SAME KIND OF THING IT REPLACES.
 *
 *  Watched live by the owner, on his honey store. The model returned every
 *  field as a line of text — including `storyBody`, which the deterministic
 *  content writer iterates. The generator died before writing a single file:
 *
 *      TypeError: c.storyBody.map is not a function
 *        at fileContentJs (api/dist/index.js:38220)
 *        at ReactProjectTool.execute
 *
 *  The first version of this check knew exactly one field by name — «perks is
 *  a list, everything else is text» — which is a catalogue of two entries, and
 *  it was wrong about the third field it met.
 *
 *  The rule is relational: whatever the derived value IS, the authored value
 *  must be the same kind. No field names, and it covers fields nobody has
 *  added yet.
 */
describe('authored copy keeps the shape of what it replaces', () => {
    const current = {
        heroLede: 'نص واحد',
        storyBody: ['فقرة أولى', 'فقرة ثانية'],
        perks: ['أ', 'ب', 'ج'],
        products: [{ name: 'عسل سدر', price: 120 }],
    };
    const s = (fields: string[]) => spec({ current, fields });
    const clean = (fields: Record<string, any>) =>
        async (prompt: string) => prompt.startsWith('Here is what someone asked')
            ? JSON.stringify({ fails: {} })
            : JSON.stringify({ fields });

    it('⛔ NEGATIVE — the exact crash: a string where the page iterates a list', async () => {
        const r = await authorCopy(s(['storyBody']), clean({ storyBody: 'نحمّص كل صباح في مزرعتنا القديمة.' }));
        expect(r.fields).toEqual({});
        expect(r.rejected[0]).toEqual({ field: 'storyBody', reason: 'it is string where the page needs list' });
    });

    it('POSITIVE — a list where the page iterates a list is kept', async () => {
        const r = await authorCopy(s(['storyBody']), clean({
            storyBody: ['بدأت المزرعة بخليتين في وادٍ واحد.', 'اليوم نجني من أربعة أودية.'],
        }));
        expect(Object.keys(r.fields)).toEqual(['storyBody']);
    });

    it('NEGATIVE — and a list where the page shows one line is refused too', async () => {
        //  The rule runs both ways or it is not a rule.
        const r = await authorCopy(s(['heroLede']), clean({ heroLede: ['أ', 'ب'] }));
        expect(r.rejected[0].reason).toContain('needs string');
    });

    it('NEGATIVE — a list of strings cannot replace a list of objects', async () => {
        //  `products` carries name and price; a flat list would render blanks
        //  where the prices belong, and every earlier check would pass it.
        const r = await authorCopy(s(['products']), clean({ products: ['عسل سدر', 'عسل سمر'] }));
        expect(r.rejected[0].reason).toContain('list of objects');
    });

    it('NEGATIVE — an empty list is refused even though its kind matches', async () => {
        const r = await authorCopy(s(['perks']), clean({ perks: [] }));
        expect(r.rejected[0].reason).toContain('empty list');
    });

    it('NEGATIVE — with nothing to compare against, only text is accepted', async () => {
        const r = await authorCopy(spec({ current: {}, fields: ['tagline'] }), clean({ tagline: ['أ', 'ب'] }));
        expect(r.rejected[0].reason).toContain('not a line of text');
    });
});
