import {
    blueprintFor,
    derivedColumns,
    detectAppKind,
} from '../core/design/app-blueprints';
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';

const LIBRARY_BOARD = [
    'Create a small browser-based library checkout board in a new local project.',
    'It needs title, borrower, due date, a returned toggle, filtering, validation, and local persistence.',
].join(' ');

describe('checkout meaning and field boundaries', () => {
    it('keeps lending checkout out of the commerce engine', () => {
        expect(detectAppKind(LIBRARY_BOARD)).toBe('generic');
        expect(detectAppKind(
            'Build an equipment checkout register with asset tag, borrower, due date, and a returned checkbox.',
        )).toBe('generic');
    });

    it('stops the schema where capabilities begin', () => {
        expect(derivedColumns(LIBRARY_BOARD)).toEqual([
            expect.objectContaining({ label: 'title', type: 'text' }),
            expect.objectContaining({ label: 'borrower', type: 'text' }),
            expect.objectContaining({ label: 'due date', type: 'date' }),
            expect.objectContaining({ label: 'returned', role: 'flag', control: 'toggle', options: ['No', 'Yes'] }),
        ]);
    });

    it('turns the explicit binary control into a switch and a filter', () => {
        const blueprint = blueprintFor('generic', LIBRARY_BOARD, false);
        expect(blueprint.fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: 'returned', control: 'toggle', options: ['No', 'Yes'] }),
        ]));
        expect(blueprint.filterFields).toEqual(expect.arrayContaining(['flag1']));
        const files = buildAppFiles(
            blueprint,
            { isArabic: false, brand: 'Library Board', storeKey: 'library-board' } as any,
            'library-board',
        );
        expect(files['src/content.js']).toMatch(/control: 'toggle'/);
        expect(files['src/components/RecordsView.jsx']).toMatch(/type="checkbox" role="switch"/);
    });

    it.each([
        'Build an online store with a cart checkout flow.',
        'Create a payment checkout page for an ecommerce shop.',
        'Build a marketplace with shopping cart and checkout.',
    ])('keeps real commerce transactional: %s', request => {
        expect(detectAppKind(request)).toBe('store');
    });

    it('does not turn a capability-only list into database fields', () => {
        expect(derivedColumns('Build a page with loading, filtering, validation, and error states.')).toBeNull();
    });
});
