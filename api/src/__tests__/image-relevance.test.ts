/**
 * Whether a photograph is of what was asked for.
 *
 * Joe built a page for a software consultancy and illustrated it with a castle
 * in Copenhagen, a Sony PlayStation 2, and a portrait captioned "Founder June
 * 2025". The credits line at the bottom of the shipped page names all three:
 *
 *   Christiansborg_Slot_Copenhagen_2014_01.jpg   — Julian Herzog, CC BY 4.0
 *   Sony_Playstation_2_SCPH-5001_V9_-_Portas_USB…jpg — Deni Williams, CC BY 2.0
 *   Founder_June_2025.jpg                        — LJonesTlor, CC BY-SA 4.0
 *
 * The relevance gate was "one shared term is enough", matched as a SUBSTRING
 * against title + description + every Wikimedia category joined into one string.
 * A Commons file carries a long category list, so one incidental shared word is
 * nearly free — and substring matching gave away more still: "slot" matched
 * «Christiansborg Slot», "port" matched "ports" and "Portas".
 *
 * The cases below are the real filenames and the real category names.
 */

import { isRelevant, relevanceOf } from '../core/design/images';

const CASTLE = { title: 'Christiansborg Slot Copenhagen 2014 01', description: '', tags: ['Software', 'Buildings in Copenhagen'] };
const CONSOLE = { title: 'Sony Playstation 2 SCPH 5001 V9 Portas USB 1.1, do controle Dualshock 2 e do Memory Card USB 1.1, Dualshock 2 controller and Memory Card slot ports', description: '', tags: ['Sony products', 'Office equipment'] };
const FOUNDER = { title: 'Founder June 2025', description: '', tags: ['Business people', 'Portrait photographs'] };

describe('the three photographs that actually shipped are refused', () => {
    it.each([
        ['a castle for "software developer"', 'software developer', CASTLE],
        ['a castle for "programming"', 'programming', CASTLE],
        ['a games console for "team meeting office"', 'team meeting office', CONSOLE],
        ['a games console for "software developer working on a project"', 'software developer working on a project', CONSOLE],
        ['a stock portrait for "business consultant"', 'business consultant', FOUNDER],
    ])('refuses %s', (_label, query, meta) => {
        expect(isRelevant(query, meta)).toBe(false);
    });

    it('names how thin the evidence was, rather than just saying no', () => {
        const got = relevanceOf('software developer', CASTLE);
        expect(got.matched).toEqual(['software']);
        expect(got.share).toBeCloseTo(0.5);
    });
});

describe('one word is a coincidence, two is a subject', () => {
    it('accepts a candidate that supports two of the terms', () => {
        expect(isRelevant('business consultant working with a client', {
            title: 'Business meeting with a consultant', tags: [],
        })).toBe(true);
    });

    it('accepts an exact subject match', () => {
        expect(isRelevant('chef plating a dish', { title: 'Chef plating a dish in a restaurant kitchen', tags: [] })).toBe(true);
    });

    it('refuses a candidate that supports only one', () => {
        expect(isRelevant('business consultant', { title: 'Business district skyline at night', tags: [] })).toBe(false);
    });

    it('a single-term subject must match that term', () => {
        expect(isRelevant('programming', { title: 'Programming a microcontroller', tags: [] })).toBe(true);
        expect(isRelevant('programming', { title: 'Christiansborg Slot', tags: [] })).toBe(false);
    });
});

describe('whole words, not substrings', () => {
    it('does not let "slot" match «Christiansborg Slot»', () => {
        // The literal mechanism that put a castle on a consulting page.
        expect(relevanceOf('memory card slot', { title: 'Christiansborg Slot Copenhagen', tags: [] }).matched)
            .toEqual(['slot']);
        expect(isRelevant('memory card slot', { title: 'Christiansborg Slot Copenhagen', tags: [] })).toBe(false);
    });

    it('does not let a term match inside a longer unrelated word', () => {
        expect(relevanceOf('port terminal', { title: 'Portugal important reports', tags: [] }).matched).toEqual([]);
        expect(relevanceOf('cat clinic', { title: 'Catalogue of application catalysts', tags: [] }).matched).toEqual([]);
    });

    it('still treats a plural as the same word', () => {
        expect(relevanceOf('developer laptop', { title: 'Developers using laptops', tags: [] }).matched.sort())
            .toEqual(['developer', 'laptop']);
        expect(isRelevant('developer laptop', { title: 'Developers using laptops', tags: [] })).toBe(true);
    });

    it('folds a -y plural too', () => {
        expect(relevanceOf('bakery counter', { title: 'Bakeries and their counters', tags: [] }).matched.sort())
            .toEqual(['bakery', 'counter']);
    });
});

describe('an unverifiable candidate is refused, not waved through', () => {
    it('refuses a candidate with no metadata at all', () => {
        // It used to return true — "no metadata: don't punish it". A photograph
        // that cannot be shown to be of the right thing loses to the page's own
        // gradient, which is designed and on-palette.
        expect(isRelevant('software developer', { title: '', description: '', tags: [] })).toBe(false);
        expect(isRelevant('software developer', {})).toBe(false);
    });

    it('accepts anything when the subject itself carries no meaning', () => {
        // Nothing to check against is a different thing from failing the check.
        expect(isRelevant('a photo of the', { title: 'anything', tags: [] })).toBe(true);
        expect(isRelevant('', { title: 'anything', tags: [] })).toBe(true);
    });

    it('ignores the words that prove nothing about a subject', () => {
        const got = relevanceOf('photo of people in the background', { title: 'x', tags: [] });
        expect(got.terms).toEqual([]);
    });
});

describe('real subjects a build should still find', () => {
    it.each([
        ['restaurant interior', { title: 'Restaurant interior with wooden tables', tags: ['Restaurants'] }],
        ['solar panel installation', { title: 'Solar panels being installed on a roof', tags: ['Solar panel', 'Installation'] }],
        ['dental clinic chair', { title: 'Dental chair in a modern clinic', tags: ['Dentistry'] }],
        ['barista coffee', { title: 'Barista preparing coffee', tags: [] }],
    ])('accepts %s', (query, meta) => expect(isRelevant(query as string, meta)).toBe(true));
});

/* ---------- subjects grounded in what the business actually is -------------- */

import {
    namesAPerson, buildImageBrief, groundSubject, isSpecificEnough,
} from '../core/design/image-brief';

describe('a request written entirely in Arabic still grounds its images', () => {
    /**
     * The hole this closes: the sector table only fires for the sectors it
     * lists. «مكتب هندسة معمارية» matched nothing, so `vocabulary` held only the
     * Latin words the user typed — and in a pure-Arabic request that is NOTHING.
     * `isSpecificEnough` then returned true on its "nothing to check against"
     * branch and the entire grounding pass was inert for exactly the requests
     * that needed it most.
     */
    it('reads Arabic nouns the sector table never covered', () => {
        const brief = buildImageBrief('اريد موقعا لمكتب هندسة معمارية في الرياض');
        expect(brief.vocabulary.length).toBeGreaterThan(0);
        expect(brief.suggestions.join(' ')).toMatch(/architecture|engineering/);
    });

    it.each([
        ['مشتل نباتات وزهور', /flower|plant/],
        ['شركة شحن وتوصيل طلبات', /delivery|warehouse/],
        ['مصنع أثاث خشبي', /furniture|factory/],
        ['عيادة بيطرية للحيوانات الأليفة', /veterinary/],
        ['مخبز وحلويات', /bakery/],
    ])('%s finds a real subject', (request, want) => {
        expect(buildImageBrief(request).suggestions.join(' ')).toMatch(want);
    });

    it('replaces a generic subject once there is a vocabulary to judge against', () => {
        const brief = buildImageBrief('موقع لشركة مقاولات وبناء');
        const grounded = groundSubject('business people', brief, 0);
        expect(grounded).not.toBe('business people');
        expect(grounded).toMatch(/construction/);
    });
});

describe('a phrase of pure filler names nothing, however long', () => {
    const brief = buildImageBrief('شركة برمجيات');

    it.each([
        'professional business people in a modern office',
        'happy young team working at a desk',
        'successful corporate group photo',
    ])('rejects "%s"', s => expect(isSpecificEnough(s, brief)).toBe(false));

    it('still accepts a phrase with a real subject in it', () => {
        expect(isSpecificEnough('software developer reviewing source code', brief)).toBe(true);
    });
});

describe('an avatar is a face', () => {
    /**
     * Ranking by shape calls a square photo of an espresso machine a perfect
     * avatar. It is square and it is wrong: that circle is where a customer's
     * portrait goes. The subject has to name a person before the search runs.
     */
    const brief = buildImageBrief('مقهى متخصص في القهوة المختصة');

    it('turns a non-person avatar subject into a person', () => {
        const g = groundSubject('espresso machine close up', brief, 0, 'avatar');
        expect(namesAPerson(g)).toBe(true);
        expect(g).toMatch(/barista|portrait/);
    });

    it('keeps a person subject that is already grounded', () => {
        const g = groundSubject('barista portrait smiling', brief, 0, 'avatar');
        expect(g).toBe('barista portrait smiling');
    });

    it('asks for a person even when the trade is unknown', () => {
        const bare = buildImageBrief('اريد صفحة');
        const g = groundSubject('a wide mountain range', bare, 0, 'avatar');
        expect(namesAPerson(g)).toBe(true);
    });

    it('leaves other slots to their own subject', () => {
        const g = groundSubject('coffee beans roasting', brief, 0, 'hero');
        expect(g).toBe('coffee beans roasting');
    });
});
