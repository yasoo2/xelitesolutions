/**
 * THE DENOMINATOR WAS THE CATALOGUE'S IDEA OF HIS REQUEST.
 *
 * Joe's own terminal, on a real run:
 *
 *     I don't know this app type and have no ready engine — I'll build a
 *     generic structure. From your request I understood: an interactive button.
 *
 * for a request that named five things. And the ledger then closed on «all 1/1
 * requested criteria were proven» — a sentence in which nothing is false and
 * everything is wrong, because **a ledger can never be more complete than the
 * reading it is handed.**
 *
 * ⛔ ONE READER WAS DOING TWO JOBS. `acceptanceCriteriaFor` matches a fixed
 * table of features it already knows how to prove, and it was serving as the
 * EXTRACTION as well as the JUDGEMENT. So «what did he ask for?» could only be
 * answered with «which of my known features did he mention?» — and «I don't
 * know this app type» is that table speaking out loud.
 *
 * This file guards the repair, and the repair has two halves that must both
 * hold or neither is worth anything:
 *
 *   1. the reading is his sentence, quoted, not a catalogue lookup; and
 *   2. each thing read is proven by READING THE BUILT SOURCE — with any «met»
 *      whose evidence is not in that source downgraded rather than believed.
 *
 * Without (2) the denominator simply grows with criteria nothing can check,
 * which is the third class this repository has paid for: a criterion Joe's own
 * output can never satisfy.
 */

import fs from 'fs';
import path from 'path';
import { earlyProjectDeclaration } from '../modules/tools/definitions/ReactProjectTool';
import { verifyNamed, foundInSource, nothingWasJudged, NamedRequirement } from '../core/quality/named-requirements';

const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'),
    'utf-8',
);

const FIVE: NamedRequirement[] = [
    { id: 'req-a', text: 'a service list with prices', quote: 'a service list with prices' },
    { id: 'req-b', text: 'opening hours', quote: 'opening hours' },
    { id: 'req-c', text: 'location', quote: 'location' },
    { id: 'req-d', text: 'a phone CTA', quote: 'phone CTA' },
    { id: 'req-e', text: 'a booking form', quote: 'a booking form' },
];

const SOURCE = `
export function Services() {
  return <ul className="service-list">{SERVICES.map(s => <li key={s.id}>{s.name} — {money(s.price)}</li>)}</ul>;
}
export function BookingForm() {
  return <form onSubmit={submitBooking}><input name="when" required /><button>Book</button></form>;
}
`;

const answering = (payload: any) => async () => JSON.stringify(payload);

describe('what he named is what gets counted', () => {
    it('⛔ POSITIVE — the announcement says all five, not the one the table knew', () => {
        const said = earlyProjectDeclaration({
            request: 'Include a service list with prices, opening hours, location, phone CTA, and a booking form.',
            isArabic: false,
            appKind: null,
            named: FIVE,
        });
        expect(said).toContain('a service list with prices');
        expect(said).toContain('opening hours');
        expect(said).toContain('location');
        expect(said).toContain('a phone CTA');
        expect(said).toContain('a booking form');
    });

    it('NEGATIVE — with nothing read, the old catalogue still answers', () => {
        //  The floor must survive. Deleting it would trade one silent failure
        //  for another the first time a provider is down.
        const said = earlyProjectDeclaration({
            request: 'a button that increments a visible counter',
            isArabic: false,
            appKind: null,
            named: [],
        });
        expect(typeof said).toBe('string');
        expect(said).toContain('From your request I understood');
    });

    it('⛔ NEGATIVE — EVERY mouth that speaks this sentence is handed the list', () => {
        //  The most repeated defect in this repository is a rule that reached
        //  one writer and not the other. `earlyProjectDeclaration` is called
        //  from more than one place, and a call site that forgot `named` would
        //  quietly restore «an interactive button» on that branch alone —
        //  green everywhere else, and impossible to see.
        const sites = [...REACT.matchAll(/earlyProjectDeclaration\(\{[\s\S]{0,400}?\}\)/g)].map(m => m[0]);
        expect(sites.length).toBeGreaterThanOrEqual(2);
        for (const [i, site] of sites.entries()) {
            expect({ site: i, carriesTheList: /named:/.test(site) })
                .toEqual({ site: i, carriesTheList: true });
        }
    });

    it('⛔ POSITIVE — his request is read BEFORE anything is chosen', () => {
        //  «Early» is the whole point: a reading that happens after the kind is
        //  detected and the template picked is a report, not a decision.
        const read = REACT.indexOf('await namedRequirements(request, isAr, askTheModel)');
        const declared = REACT.indexOf('earlyProjectDeclaration({');
        const judged = REACT.indexOf('const acceptance = judgeAcceptance(');
        expect({ read: read > 0, beforeTheAnnouncement: read < declared, beforeTheJudgement: read < judged })
            .toEqual({ read: true, beforeTheAnnouncement: true, beforeTheJudgement: true });
    });

    it('⛔ NEGATIVE — a fall back to the catalogue is ANNOUNCED, never silent', () => {
        //  A silent fallback restores the exact defect with no way for him to
        //  see that it came back. That is worse than the original, which at
        //  least said «I don't know this app type» out loud.
        expect(REACT).toContain('falling back to the known-features list');
        expect(REACT).toMatch(/acceptance denominator: \$\{criteriaForJudgement\.length\}/);
    });
});

describe('a named requirement is proven by reading the source', () => {
    it('POSITIVE — a verdict carrying a real line of the build is met', async () => {
        const judged = await verifyNamed(FIVE.slice(0, 1), SOURCE, false, answering({
            verdicts: [{
                id: 'req-a', verdict: 'met',
                evidence: '<ul className="service-list">',
                why: 'the list renders every service with its price',
            }],
        }));
        expect(judged[0].verdict).toBe('met');
    });

    it('⛔ NEGATIVE — a «met» whose evidence is NOT in the source is downgraded', async () => {
        //  This is the one branch where a lie is expensive, so it is the one
        //  branch checked instead of believed. A model that invents a line it
        //  wishes were there would otherwise hand Joe a green ledger over a
        //  build that never had the feature — Joe awarding itself the mark,
        //  which is the disease this whole repository has been treating.
        const judged = await verifyNamed(FIVE.slice(3, 4), SOURCE, false, answering({
            verdicts: [{
                id: 'req-d', verdict: 'met',
                evidence: '<a href="tel:+15551234567" className="phone-cta">Call us</a>',
                why: 'the phone CTA is in the header',
            }],
        }));
        expect(judged[0].verdict).toBe('unprovable');
        expect(judged[0].why).toContain('not in the source');
    });

    it('⛔ NEGATIVE — a token that lives in every file proves nothing', () => {
        //  `form`, `div`, `{}` appear in every build ever made. Accepting one
        //  as evidence is the `filter` defect again: a token present
        //  everywhere standing in for a claim.
        expect(foundInSource('form', SOURCE)).toBe(false);
        expect(foundInSource('<form', SOURCE)).toBe(false);
        expect(foundInSource('export function BookingForm()', SOURCE)).toBe(true);
    });

    it('⛔ NEGATIVE — a brain that cannot be reached certifies nothing', async () => {
        //  And condemns nothing. `met` would be a dead brain awarding a pass;
        //  `unmet` would be a dead brain failing a build it never opened.
        const judged = await verifyNamed(FIVE, SOURCE, true, async () => { throw new Error('no provider'); });
        expect(judged.map(j => j.verdict)).toEqual(['unprovable', 'unprovable', 'unprovable', 'unprovable', 'unprovable']);
        expect(judged[0].why).toContain('لم أفحصه');
    });

    it('NEGATIVE — a requirement the model skipped is unprovable, not met', async () => {
        const judged = await verifyNamed(FIVE.slice(0, 2), SOURCE, false, answering({
            verdicts: [{ id: 'req-a', verdict: 'met', evidence: '<ul className="service-list">', why: 'ok' }],
        }));
        expect(judged[1].verdict).toBe('unprovable');
    });

    it('NEGATIVE — an unmet stays unmet and carries its reason', async () => {
        const judged = await verifyNamed(FIVE.slice(1, 2), SOURCE, false, answering({
            verdicts: [{ id: 'req-b', verdict: 'unmet', evidence: '', why: 'no opening hours anywhere in the build' }],
        }));
        expect(judged[0]).toMatchObject({ verdict: 'unmet', why: 'no opening hours anywhere in the build' });
    });
});

/**
 * ⛔ A LEDGER NOBODY COULD FILL IS NOT A FAILING LEDGER.
 *
 * Measured live on `c9f0506b`, on a project that had really been built:
 *
 *     acceptance denominator: 2 (2 read from your request + 0 structural)
 *     ?? <each item> — I did not inspect it — I could not read the source
 *     acceptance: 0/2 requested criteria proven
 *     delivery: BLOCKED — acceptance ledger is not accepted
 *
 * `verifyNamed`'s own comment says a brain that cannot be reached «certifies
 * nothing and condemns nothing». It was wired to condemn: every item
 * `unprovable` reads downstream as `0/N proven`, and delivery blocks on that.
 * **The rule was written and then wired past** — absence of evidence became
 * evidence of failure.
 *
 * And the cost was not a corner case. P01 replaced criteria the catalogue could
 * prove BY PATTERN with criteria only a model can prove, so on a weak brain Joe
 * built correctly and then refused to hand anything over. No unit guard could
 * see it, because every one of them injects a model that answers — which is
 * exactly why the case below injects one that does not.
 */
describe('a judge that could not look does not condemn', () => {
    const TWO: NamedRequirement[] = [
        { id: 'req-a', text: 'a service list with prices', quote: 'a service list with prices' },
        { id: 'req-b', text: 'a booking form', quote: 'a booking form' },
    ];

    it('⛔ POSITIVE — every item unprovable is a BLIND judge, not a failed build', async () => {
        const judged = await verifyNamed(TWO, SOURCE, false, async () => { throw new Error('no provider'); });
        expect(nothingWasJudged(judged)).toBe(true);
    });

    it('⛔ NEGATIVE — one real «unmet» is NOT blindness, and must still block', async () => {
        //  The whole distinction. A source that WAS read and something that WAS
        //  missing is a real failure, and widening the fallback to cover it
        //  would turn this repair into the thing it is repairing.
        const judged = await verifyNamed(TWO, SOURCE, false, answering({
            verdicts: [
                { id: 'req-a', verdict: 'unmet', evidence: '', why: 'no prices anywhere' },
                { id: 'req-b', verdict: 'unprovable', evidence: '', why: 'could not tell' },
            ],
        }));
        expect(nothingWasJudged(judged)).toBe(false);
    });

    it('NEGATIVE — one real «met» is not blindness either', async () => {
        const judged = await verifyNamed(TWO, SOURCE, false, answering({
            verdicts: [
                { id: 'req-a', verdict: 'met', evidence: '<ul className="service-list">', why: 'the list is there' },
                { id: 'req-b', verdict: 'unprovable', evidence: '', why: 'could not tell' },
            ],
        }));
        expect(nothingWasJudged(judged)).toBe(false);
    });

    it('NEGATIVE — nothing to judge is not blindness', () => {
        //  An empty list must not trip the fallback: a request that named
        //  nothing is a different fact from a judge that could not look, and
        //  merging them would make the fallback fire on every catalogue run.
        expect(nothingWasJudged([])).toBe(false);
    });

    it('⛔ the three causes are three sentences, and each names what happened', async () => {
        //  One string for three causes is how a diagnosis goes an hour in the
        //  wrong direction: the live report said «I could not read the source»
        //  when the source was fine and the model simply never ruled.
        const noSource = await verifyNamed(TWO.slice(0, 1), '', false, answering({ verdicts: [] }));
        expect(noSource[0].why).toContain('could not read the project source');

        const noVerdict = await verifyNamed(TWO.slice(0, 1), SOURCE, false, answering({ verdicts: [] }));
        expect(noVerdict[0].why).toContain('no verdict for this item');

        const undecided = await verifyNamed(TWO.slice(0, 1), SOURCE, false, answering({
            verdicts: [{ id: 'req-a', verdict: 'unprovable', evidence: '', why: '' }],
        }));
        expect(undecided[0].why).toContain('could not tell from the source');
    });

    it('⛔ NEGATIVE — the builder acts on it, and says so out loud', () => {
        //  A silent fallback here would hide the fact that his ledger came from
        //  the catalogue rather than from his own words — the same silence this
        //  whole repair exists to remove.
        expect(REACT).toContain('const judgeWasBlind = nothingWasJudged(namedVerdicts);');
        expect(REACT).toMatch(/const namedJudged = judgeWasBlind \? \[\] : namedVerdicts;/);
        expect(REACT).toContain('the judge could not rule on any of the');
    });
});
