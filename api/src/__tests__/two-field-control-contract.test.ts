import { fieldsFromRequest } from '../core/design/app-blueprints';

describe('two-field lists with explicit control evidence', () => {
    test.each([
        ['Build an equipment return board with title and a returned toggle.', 'returned'],
        ['Create a submissions app with title and a reviewed checkbox.', 'reviewed'],
        ['Create a tracker with title and an enabled switch.', 'enabled'],
    ])('preserves the two named fields: %s', (request, label) => {
        const fields = fieldsFromRequest(request, false);
        expect(fields?.map(field => field.label)).toEqual(['title', label]);
        expect(fields?.[1].control).toBe('toggle');
        expect(fields?.[1].options).toEqual(['No', 'Yes']);
    });
    test.each([
        'Build an app with a home page and a contact form.',
        'Build an app with clean colors and readable typography.',
        'Write a story with title and an enabled switch.',
        'Build a keyboard with title and an enabled switch.',
    ])('does not promote prose or UI requests into stored fields: %s', request => {
        expect(fieldsFromRequest(request, false)).toBeNull();
    });
});
