import { subjectPhrase } from '../core/design/subject-phrase';

describe('product subjects exclude execution locations', () => {
    it.each(['in a new local project', 'inside the existing workspace', 'under my selected folder'])('excludes %s', location => {
        expect(subjectPhrase(`Create a small browser-based library checkout board ${location}.`, 48))
            .toBe('small browser-based library checkout board');
    });
    it('retains a real location in the product subject', () => {
        expect(subjectPhrase('Create a travel guide in New York.')).toBe('travel guide in New York');
    });
    it('cuts a long direct noun phrase at a word boundary', () => {
        expect(subjectPhrase('Create a regional service operations dashboard with filtering.', 30))
            .toBe('regional service operations');
    });
    it('preserves explicitly named subject handling', () => {
        expect(subjectPhrase('Build a landing page for a design studio called Noor inside the current workspace.'))
            .toBe('design studio');
    });
});
