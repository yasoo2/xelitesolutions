/**
 * JOE REFUSED TO DELIVER BECAUSE HE COULD NOT PROVE A REQUIREMENT HE HAD
 * WRITTEN HIMSELF.
 *
 * From the ledger of a real run, on the exact request:
 *
 *     Build a responsive website for a neighborhood bicycle repair studio
 *     called Spoke & Stem. Include a service list with prices, opening hours,
 *     location, phone CTA, and a booking form.
 *
 *     { "id": "rule:1", "kind": "feature",
 *       "en": "your condition: «do not invent beyond it) ---»",
 *       "expectedRule": { "text": "do not invent beyond it) ---",
 *                         "kind": "forbid", "field": "invent" } }
 *
 *     acceptance: 0/1 requested criteria proven
 *     delivery: BLOCKED
 *
 * «do not invent beyond it) ---» is not his condition. It is a fragment of the
 * wrapper `ProjectPipelineTool.ts:1050` appends to his sentence — including the
 * trailing `) ---` of the banner it was cut out of. Joe derived the owner's
 * requirement from Joe's own scaffolding, failed to prove it, and withheld a
 * site it had actually built.
 *
 * ⛔ AND THE REPAIR ALREADY EXISTED. `hisWordsOnly` cuts exactly that block and
 * handles both banners — «AUTHORITATIVE DISCOVERY EVIDENCE» and «COMPACT
 * REQUIREMENTS EVIDENCE», measured in its own comment. `entity-inference` and
 * `app-blueprints` have called it for months. The acceptance judge — the one
 * reader whose entire job is «what did HE ask for» — never did.
 *
 * That is this session's most repeated class in its ninth appearance: a layer
 * exists and a second reader never asks. The guard beside the entity reader
 * even says it out loud — «its only caller was inside its own file» — and the
 * sentence was true of this file too.
 */

import { acceptanceFor } from '../core/quality/acceptance';

const HIS = 'Build a responsive website for a neighborhood bicycle repair studio called Spoke & Stem. Include a service list with prices, opening hours, location, phone CTA, and a booking form.';

/** The wrapper the pipeline appends, verbatim in shape. */
const COMPACT = '\n\n--- COMPACT REQUIREMENTS EVIDENCE (derived from complete local files read through read_file; do not invent beyond it) ---\nsome evidence text\n--- END COMPACT REQUIREMENTS EVIDENCE ---';
const AUTHORITATIVE = '\n\nAUTHORITATIVE REQUIREMENTS EVIDENCE (derived from the complete local specification; do not invent beyond it):\nhere is the brief text';

describe('the judge reads his words, never Joe’s paperwork', () => {
    it('⛔ POSITIVE — the wrapper adds no criterion of its own', () => {
        //  The defect, stated as the equality it broke: enriching a request
        //  with Joe's own banner must not change what HE asked for.
        expect(acceptanceFor(HIS + COMPACT).map(c => c.id))
            .toEqual(acceptanceFor(HIS).map(c => c.id));
    });

    it('POSITIVE — and the same holds for the other banner', () => {
        //  Two different words. Banning one would have fixed one round and
        //  left the defect standing — its own comment says so.
        expect(acceptanceFor(HIS + AUTHORITATIVE).map(c => c.id))
            .toEqual(acceptanceFor(HIS).map(c => c.id));
    });

    it('⛔ NEGATIVE — «do not invent beyond it» never becomes a rule again', () => {
        //  The exact string from the ledger that blocked his delivery.
        for (const wrapped of [HIS + COMPACT, HIS + AUTHORITATIVE]) {
            const rules = acceptanceFor(wrapped)
                .map(c => String((c as any).expectedRule?.text || ''))
                .filter(Boolean);
            expect(rules.some(t => t.includes('invent'))).toBe(false);
            expect(rules.some(t => t.includes('---'))).toBe(false);
        }
    });

    it('NEGATIVE — a rule HE really states is still read', () => {
        //  The repair must cut Joe's paperwork, not his conditions. Without
        //  this, «read only his words» could be satisfied by reading nothing.
        const withRule = 'اعمل لي متجراً لبيع العسل، ولا تقبل سعراً صفراً أو سالباً.';
        const ids = acceptanceFor(withRule).map(c => c.id);
        expect(ids.some(id => id.startsWith('rule'))).toBe(true);
    });

    it('NEGATIVE — and his own rule survives the wrapper too', () => {
        //  The case that proves the cut is a CUT and not a truncation: his
        //  sentence keeps everything, the banner keeps nothing.
        const withRule = 'اعمل لي متجراً لبيع العسل، ولا تقبل سعراً صفراً أو سالباً.';
        expect(acceptanceFor(withRule + COMPACT).map(c => c.id))
            .toEqual(acceptanceFor(withRule).map(c => c.id));
    });

    it('NEGATIVE — two paragraphs of HIS are not cut at the blank line', () => {
        //  `hisWordsOnly` also cuts at a blank line, which is Joe's mark only
        //  when Joe put it there. A man writing two paragraphs must not lose
        //  the second.
        const twoParas = 'اعمل لي متجراً لبيع العسل.\n\nولا تقبل سعراً صفراً أو سالباً.';
        const ids = acceptanceFor(twoParas).map(c => c.id);
        expect(ids.some(id => id.startsWith('rule'))).toBe(true);
    });
});
