import { blueprintFor, AppBlueprint } from '../core/design/app-blueprints';
import { fileAppContentJs, fileRecordsAppJsx, requestedBoardField } from '../modules/tools/definitions/react-app-templates';
import { transformSync } from 'esbuild';

const blueprint = (): AppBlueprint => ({
    ...blueprintFor('generic', 'Build a records app', false),
    fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'returned', label: 'Returned', type: 'select', options: ['No', 'Yes'], control: 'toggle' },
    ],
});

describe('requested records board presentation', () => {
    test.each(['Create a library checkout board.', 'Build an equipment return board.', 'Create a kanban for submissions.'])('%s uses the declared grouping field', request => {
        expect(requestedBoardField(blueprint(), request)).toBe('returned');
    });
    test.each(['Create a dashboard.', 'Build a keyboard inventory app.', 'Build a records app.', 'Build a board with a table for the records.'])('%s does not silently switch to a board', request => {
        expect(requestedBoardField(blueprint(), request)).toBeNull();
    });
    test('ambiguous grouping is not guessed, and an explicit status contract disambiguates it', () => {
        const bp = blueprint();
        bp.fields.push({ key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'High'] });
        expect(requestedBoardField(bp, 'Create a board.')).toBeNull();
        bp.statusField = 'priority';
        expect(requestedBoardField(bp, 'Create a board.')).toBe('priority');
    });
    test('content carries a field key, not a copied domain-specific template', () => {
        expect(fileAppContentJs(blueprint(), { brand: 'Returns', isArabic: false, storeKey: 'test', sourceRequest: 'Create a return board.' })).toContain('boardField: "returned"');
    });
    test.each([false, true])('generated JSX remains valid in both languages: %s', isAr => {
        expect(() => transformSync(fileRecordsAppJsx(isAr), { loader: 'jsx' })).not.toThrow();
    });
});
