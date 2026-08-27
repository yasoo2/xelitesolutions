/**
 * HE NAMED FIVE THINGS AND JOE KEPT ONE.
 *
 * From Joe's own log, on a real run:
 *
 *     I don't know this app type and have no ready engine — I'll build a
 *     generic structure. From your request I understood: an interactive button.
 *
 * The request:
 *
 *     Build a responsive website for a neighborhood bicycle repair studio
 *     called Spoke & Stem. Include a service list with prices, opening hours,
 *     location, phone CTA, and a booking form.
 *
 * ⛔ THE FOURTH LAW AT ITS MOST LITERAL: the request is the authority, and four
 * fifths of it was discarded before anything was chosen. Everything downstream
 * — the routing, the template, the build, the ledger — was faithful to a
 * request that had already been thrown away.
 *
 * And it explains a green nobody should have trusted: «all 1/1 requested
 * criteria were proven» was true and meaningless, because the denominator was
 * one. **A ledger can never be more complete than the reading it is handed.**
 *
 * ⛔ AND THE REPAIR MUST NOT BE A BIGGER CATALOGUE. `acceptanceCriteriaFor`
 * matches a fixed table, so anything outside it is invisible — «I don't know
 * this app type» IS that table speaking. More rows would push the failure one
 * prompt further out and make it louder. So the reader asks a different
 * question: what did HE name? — and every answer is quoted from his own
 * sentence, which is what the negatives below enforce.
 */

import {
    namedRequirements,
    groundedIn,
    parseRequirements,
    extractionPrompt,
    isJudgeable,
} from '../core/quality/named-requirements';

const HIS = 'Build a responsive website for a neighborhood bicycle repair studio called Spoke & Stem. Include a service list with prices, opening hours, location, phone CTA, and a booking form.';

/** What a faithful reader returns for that sentence. */
const FIVE = {
    requirements: [
        { text: 'a service list with prices', quote: 'a service list with prices' },
        { text: 'opening hours', quote: 'opening hours' },
        { text: 'location', quote: 'location' },
        { text: 'a phone CTA', quote: 'phone CTA' },
        { text: 'a booking form', quote: 'a booking form' },
    ],
};

const answering = (payload: any) => async () => JSON.stringify(payload);

describe('every behaviour he named survives the reading', () => {
    it('⛔ POSITIVE — the request that produced «an interactive button» yields five', async () => {
        const r = await namedRequirements(HIS, false, answering(FIVE));
        expect(r.requirements.map(x => x.text)).toEqual([
            'a service list with prices', 'opening hours', 'location', 'a phone CTA', 'a booking form',
        ]);
        expect(r.rejected).toEqual([]);
    });

    it('POSITIVE — and each carries the span of HIS sentence it came from', async () => {
        //  The quote is what makes the requirement checkable against his words
        //  rather than against a memory of past prompts.
        const r = await namedRequirements(HIS, false, answering(FIVE));
        for (const req of r.requirements) {
            expect({ text: req.text, grounded: groundedIn(req.quote, HIS) })
                .toEqual({ text: req.text, grounded: true });
        }
    });

    it('POSITIVE — ids are stable, so the same request reads the same twice', async () => {
        const a = await namedRequirements(HIS, false, answering(FIVE));
        const b = await namedRequirements(HIS, false, answering(FIVE));
        expect(a.requirements.map(x => x.id)).toEqual(b.requirements.map(x => x.id));
    });

    it('⛔ NEGATIVE — a requirement he never wrote is REFUSED, not quietly added', async () => {
        //  A model asked «what did he ask for» will happily add what a site
        //  like this usually has. That is the catalogue again, in a model's
        //  voice — and an invented requirement is worse than a missing one,
        //  because Joe would then build, and fail, something never asked for.
        const r = await namedRequirements(HIS, false, answering({
            requirements: [
                ...FIVE.requirements,
                { text: 'a customer login', quote: 'a customer login area' },
                { text: 'a blog', quote: 'a news blog' },
            ],
        }));
        expect(r.requirements.map(x => x.text)).not.toContain('a customer login');
        expect(r.rejected.map(x => x.text).sort()).toEqual(['a blog', 'a customer login']);
        expect(r.rejected[0].reason).toContain('not in his sentence');
    });

    it('⛔ NEGATIVE — a list is split, never kept as one requirement', async () => {
        //  «a service list with prices, opening hours, location, phone CTA, and
        //  a booking form» is five things. Counting it as one is how a
        //  denominator becomes 1 and a ledger becomes meaningless.
        const r = await namedRequirements(HIS, false, answering({
            requirements: [{
                text: 'a service list with prices, opening hours, location, phone CTA, and a booking form',
                quote: 'a service list with prices, opening hours, location, phone CTA, and a booking form',
            }],
        }));
        expect(r.requirements.length).toBe(1);
        //  The reader cannot force the split; the BRIEF must demand it, and
        //  this is the assertion that keeps that instruction in the brief.
        expect(extractionPrompt(HIS, false)).toContain('FIVE entries, not one');
    });

    it('NEGATIVE — «build a website» is not a feature', () => {
        //  The act of asking is not a thing to build. Without this the
        //  denominator inflates with words that can never be proven.
        expect(groundedIn('build', HIS)).toBe(false);
        expect(groundedIn('website', HIS)).toBe(false);
        expect(groundedIn('responsive website', HIS)).toBe(false);
    });

    it('NEGATIVE — a duplicate quote counts once', async () => {
        const r = await namedRequirements(HIS, false, answering({
            requirements: [
                { text: 'opening hours', quote: 'opening hours' },
                { text: 'the opening hours', quote: 'opening hours' },
            ],
        }));
        expect(r.requirements.length).toBe(1);
    });

    it('NEGATIVE — a provider that is down returns nothing, and says so', async () => {
        //  Silence must never look like «he asked for nothing», which is
        //  exactly how the denominator collapsed to one in the first place.
        const r = await namedRequirements(HIS, false, async () => { throw new Error('all providers unavailable'); });
        expect(r.requirements).toEqual([]);
        expect(r.rejected[0].reason).toContain('could not be reached');
    });

    it('NEGATIVE — noise yields nothing rather than a guess', () => {
        expect(parseRequirements('I cannot help with that.')).toEqual([]);
        expect(parseRequirements('')).toEqual([]);
    });

    it('⛔ NEGATIVE — the brief names no kind of site, and forbids the idea outright', () => {
        //  A brief that offered «a shop usually has…» would rebuild the
        //  catalogue inside the one place meant to be free of it.
        //
        //  ⛔ AND THIS ASSERTION WAS ITSELF THE DEFECT ONCE. Its first form
        //  searched the brief for the string «usually has» and went red — on
        //  the sentence FORBIDDING it. Word-occurrence stood in for the claim,
        //  which is the same failure as a `/min:\s*-?\d/` that passed a schema
        //  accepting zero. So it is split: the cages are site KINDS, which must
        //  be absent, and the idea itself is checked as a prohibition, present.
        const p = extractionPrompt(HIS, false).toLowerCase();
        for (const kind of ['e-commerce', 'restaurant', 'portfolio', 'dashboard', 'landing page']) {
            expect({ kind, namedAsAnExample: p.includes(kind) }).toEqual({ kind, namedAsAnExample: false });
        }
        expect(extractionPrompt(HIS, false))
            .toContain('Do NOT add what a site like this usually has');
    });
});

/**
 * ⛔ AND THEN HE RAN IT HIMSELF, AND IT NAMED THE SHOP.
 *
 * From the owner's own machine, his own prompts, hours after the reader
 * shipped — read out of `joe-session-logs.json`, not reconstructed:
 *
 *     read from your request: 2 named — build an online jewelry store · complete
 *     read from your request: 2 named — متجر مجوهرات فاخر · سله مشتريات
 *     read from your request: nothing nameable survived — falling back to the known-features list
 *
 * The reading ran and the denominator followed it, which is what the tests
 * above prove. What they could not see is that half of what it named **cannot
 * be failed**. A shop that exists satisfies «build an online jewelry store»
 * however badly it does everything he actually asked for, so a criterion like
 * that is met by definition — a denominator of one wearing a larger number.
 *
 * ⛔ AND `groundedIn` COULD NOT CATCH IT, for a reason worth keeping: it reads
 * the QUOTE, and the model quoted a long true span of his sentence while
 * writing scaffolding as the TEXT. **The check has to stand where the text is,
 * because the text is what he reads and what the ledger counts** — the same
 * lesson as the guard that had to move to the reader rather than the source.
 *
 * The imperative form is caught deterministically below. The bare-noun form
 * («متجر مجوهرات فاخر» — a subject with no verb) is NOT, and the last test
 * says so out loud rather than pretending: it is answered by the brief, which
 * makes it depend on the brain, and that dependency is declared instead of
 * hidden behind a heuristic that would also swallow «سلة مشتريات».
 */
describe('the thing he asked for is not a thing it must do', () => {
    it('⛔ NEGATIVE — his own two failures are refused', () => {
        expect(isJudgeable('build an online jewelry store')).toBe(false);
        expect(isJudgeable('اعمل متجر مجوهرات فاخر')).toBe(false);
    });

    it('⛔ NEGATIVE — and the refusal reaches the ledger BY NAME, not silently', async () => {
        //  A requirement dropped without a word is how he loses track of what
        //  Joe did with his sentence. Refusing out loud is the whole contract.
        const r = await namedRequirements(
            'build an online jewelry store, complete, with a cart and a products page',
            false,
            async () => JSON.stringify({
                requirements: [
                    { text: 'build an online jewelry store', quote: 'build an online jewelry store' },
                    { text: 'a cart', quote: 'a cart' },
                    { text: 'a products page', quote: 'a products page' },
                ],
            }),
        );
        expect(r.requirements.map(x => x.text)).toEqual(['a cart', 'a products page']);
        expect(r.rejected.map(x => x.text)).toContain('build an online jewelry store');
        expect(r.rejected[0].reason).toContain('not something it must do');
    });

    it('POSITIVE — real behaviours are untouched, in either language', () => {
        //  The filter must not become a second catalogue. Everything a build
        //  can actually fail to deliver still passes.
        for (const t of ['a booking form', 'opening hours', 'سلة مشتريات', 'صفحة منتجات', 'a phone CTA']) {
            expect({ t, judgeable: isJudgeable(t) }).toEqual({ t, judgeable: true });
        }
    });

    it('NEGATIVE — a fragment with nothing of its own is refused', () => {
        //  «complete» was really returned as a named requirement on his machine.
        expect(isJudgeable('a')).toBe(false);
        expect(isJudgeable('website')).toBe(false);
        expect(isJudgeable('   ')).toBe(false);
    });

    it('⛔ the bare-noun subject is the BRIEF\'s job, and the brief carries it', () => {
        //  «متجر مجوهرات فاخر» has no verb to catch, and any pattern wide
        //  enough to reject it would also reject «سلة مشتريات» — a real
        //  requirement from the same sentence. So it is answered where it can
        //  be answered, and this asserts the instruction is really there rather
        //  than trusting that it is.
        const brief = extractionPrompt('اعمل لي متجر مجوهرات', true);
        expect(brief).toContain('Do NOT list the project itself');
        expect(brief).toContain('could FAIL to have');
        //  ...and it is stated with his own example, so the model is told the
        //  shape rather than the rule alone.
        expect(brief).toContain('a luxury jewelry shop');
    });
});
