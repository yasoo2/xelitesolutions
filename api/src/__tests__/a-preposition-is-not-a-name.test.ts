/**
 * A PREPOSITION IS NOT A NAME.
 *
 * Observed in a real Joe UI run: asked for a duplicate-file finder working
 * «by content», Joe scaffolded a records app whose title and entity were
 * «by content» — the preposition sailed through into the product name.
 *
 * Both subject readers stripped only «of»/«for» (plus articles), so any other
 * container adjunct («by region», «from vendors», «at depot») became the name
 * of the thing. Function words are a closed class; both readers now share it.
 */
import { recordedSubject } from '../core/design/app-blueprints';
import { ENGLISH_ADJUNCT_PREPOSITION, subjectAfterContainer } from '../core/design/subject-phrase';

describe('a preposition beside the container is grammar, not the name', () => {
    it('reads the noun, not the adjunct, after a container', () => {
        // Observed shape from the real UI run.
        expect(subjectAfterContainer('finds duplicate files in a directory by content')).toBe('content');
        // Fresh variants: same grammar, unseen containers and nouns.
        expect(subjectAfterContainer('a sales tracker by region')).toBe('region');
        expect(subjectAfterContainer('an orders board by status')).toBe('status');
        expect(subjectAfterContainer('a readings ledger by month')).toBe('month');
        expect(subjectAfterContainer('a members directory by city, with search')).toBe('city');
        expect(subjectAfterContainer('a shipment register from vendors')).toBe('vendors');
        expect(subjectAfterContainer('a faults list at depots')).toBe('depots');
    });

    it('the recording-verb reader refuses the adjunct too', () => {
        expect(recordedSubject('Build a page to track by region: name, sales, quota')).toBe('region');
        expect(recordedSubject('Build a page to log from depots: name, city, stock')).toBe('depots');
        expect(recordedSubject('Build a page to record the shipments: name, weight')).toBe('shipments');
    });

    it('matches whole words, never substrings', () => {
        expect('by'.replace(ENGLISH_ADJUNCT_PREPOSITION, '')).toBe('');
        expect('Byron'.replace(ENGLISH_ADJUNCT_PREPOSITION, '')).toBe('Byron');
        expect('overs'.replace(ENGLISH_ADJUNCT_PREPOSITION, '')).toBe('overs');
        expect('atoms'.replace(ENGLISH_ADJUNCT_PREPOSITION, '')).toBe('atoms');
    });

    it('keeps the readings that were already correct', () => {
        expect(subjectAfterContainer('a clients table with name, phone and address')).toBe('clients');
        expect(subjectAfterContainer('table of orders')).toBe('orders');
        expect(subjectAfterContainer('')).toBe('');
        expect(subjectAfterContainer('no container here at all')).toBe('');
    });
});
