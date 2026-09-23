import { heAskedForATable, blueprintFor } from '../core/design/app-blueprints';
import { fileAppContentJs } from '../modules/tools/definitions/react-app-templates';

describe('layout instructions do not select the records data view', () => {
    test.each([
        'Build a records app with name and price. Use CSS grid for the form.',
        'Build a records app with name and price in a grid of cards.',
        'Build a records app with name and price. Use a card grid.',
        'Build a records app with name and price and a two-column grid layout.',
        'Build a records app with name and price. Use a grid of form fields.',
    ])('does not mistake layout for tabular data: %s', request => {
        expect(heAskedForATable(request, 2)).toBe(false);
        const blueprint = blueprintFor('generic', request, false);
        expect(blueprint.engine).toBe('records');
        const content = fileAppContentJs(blueprint, {
            brand: 'Records', isArabic: false, storeKey: 'layout-test', sourceRequest: request,
        });
        expect(content).toContain('asTable: false');
    });

    test.each([
        'Build an editable data grid with name and price.',
        'Build a grid with name and price columns.',
        'Build a spreadsheet with name and price.',
        'Use CSS grid for the form and a table for the records with name and price.',
        'Use a card grid for summaries and a data grid with name and price.',
    ])('preserves an actual data-view request: %s', request => {
        expect(heAskedForATable(request, 2)).toBe(true);
    });
});
