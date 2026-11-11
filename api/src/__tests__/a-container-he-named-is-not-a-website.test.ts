/**
 *  A CONTAINER HE NAMED IS NOT A WEBSITE.
 *
 *  Live round, in Chrome, on his machine. He wrote three words:
 *
 *      «بدي جدول»
 *
 *  and Joe answered:
 *
 *      What is the site about? A restaurant, a store, a company, a portfolio…
 *      Which sections do you want? Home, services, pricing, contact…
 *      Any colours or brand identity? Or leave it to me.
 *      One page, or several?
 *
 *  He asked for a TABLE and was asked about a site's sections and colours.
 *  The clarifier already knew the right shape — one question, about HIS thing
 *  — but it only fired when a tracking verb was present («أسجل», «track»).
 *  A bare noun has no verb, so every such request fell to a questionnaire
 *  that assumes a website. That is the fourth law broken inside the one
 *  function whose entire job is to ask about the request.
 *
 *  Since 2026-11-03 Joe no longer asks — the owner wants him to build alone
 *  (core/orchestrator/clarify.ts) — and the same rule holds for what he says
 *  he is choosing: about HIS container, in HIS word, never a website.
 */
import { decisionNote } from '../core/orchestrator/clarify';

describe('what Joe chooses is about the thing he named', () => {
    it('the exact live round: a bare table', () => {
        const q = decisionNote('بدي جدول', 'ar');
        expect(q).toContain('جدول');
        expect(q).not.toMatch(/موقع|الأقسام|ألوان|صفحة واحدة/);
    });

    it('…and it echoes HIS word, not the one we would have picked', () => {
        //  «كشف» is a ledger. Answering with «جدول» would be Joe correcting
        //  his Arabic instead of reading it.
        const q = decisionNote('بدي كشف', 'ar');
        expect(q).toContain('كشف');
        expect(q).not.toContain('جدول');
    });

    it('…in English too', () => {
        const q = decisionNote('I want a ledger', 'en');
        expect(q).toContain('ledger');
        expect(q).not.toMatch(/site|sections|colours|One page/);
    });

    it('…and a tracking verb still wins, because it names the subject', () => {
        //  The older branch is more specific: it knows WHAT is tracked.
        const q = decisionNote('بدي أسجل زبائني', 'ar');
        expect(q).toContain('زبائن');
    });
});

describe('…and a request that really is a site is decided as a site', () => {
    it('a bare site is about its subject, sections and colours', () => {
        //  The negative. Widening the container branch until it swallows this
        //  would trade one wrong questionnaire for another.
        const q = decisionNote('بدي موقع', 'ar');
        expect(q).toMatch(/موضوع|الأقسام/);
        expect(q).toContain('ألوان');
    });

    it('a bare app is decided as an app', () => {
        const q = decisionNote('I want an app', 'en');
        expect(q).toMatch(/app|sections/i);
    });

    it('a word this file has never heard of is not a container', () => {
        //  «زُرقمونية» is not a table, a list or a ledger, and nothing here
        //  pretends it is.
        const q = decisionNote('بدي زُرقمونية', 'ar');
        expect(q).toMatch(/موضوع|الأقسام/);
    });
});
