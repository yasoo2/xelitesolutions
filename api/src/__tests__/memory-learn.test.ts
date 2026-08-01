/**
 * What Joe learns about a user must be TRUE. These tests attack the exact real
 * inputs that proved the old extractor corrupted the profile — «أنا أريد بناء
 * موقع» taught the name «أريد», «I am building an api» taught «building».
 */
import { extractName, extractProfileLearnings, isCorruptedName, normalizeForMatch } from '../core/memory/learn';

describe('name extraction — the corruption is gone', () => {
    test('ordinary Arabic build requests teach NO name', () => {
        expect(extractName('أنا أريد بناء موقع لمطعم شامي عصري')).toBe('');
        expect(extractName('انا احتاج لوحة تحكم لمتجر')).toBe('');
        expect(extractName('أنا أبني تطبيقاً')).toBe('');
    });

    test('ordinary English build requests teach NO name', () => {
        expect(extractName('I am building an api for a store')).toBe('');
        expect(extractName("i'm making a landing page")).toBe('');
        expect(extractName('I am looking for a portfolio site')).toBe('');
    });

    test('an EXPLICIT introduction is learned', () => {
        expect(extractName('اسمي يونس وأريد بناء موقع')).toBe('يونس');
        expect(extractName('my name is Younes')).toBe('Younes');
        expect(extractName('call me Sara please')).toBe('Sara');
    });

    test('an introduction whose token is a verb/stopword is still refused', () => {
        // Defensive: even after «اسمي» a garbage token must not become a name.
        expect(extractName('اسمي 12345')).toBe('');
    });
});

describe('profile learnings', () => {
    test('programming languages and project types are captured, deduped, lowercased', () => {
        const r = extractProfileLearnings('I want a React and TypeScript dashboard, also a landing page');
        expect(r.programmingLanguages).toEqual(expect.arrayContaining(['react', 'typescript']));
        expect(r.projectTypes).toEqual(expect.arrayContaining(['dashboard', 'landing page']));
        expect(r.name).toBeUndefined();
    });

    test('Arabic project types are recognized', () => {
        const r = extractProfileLearnings('أريد موقع و لوحة تحكم و متجر');
        expect(r.projectTypes.length).toBeGreaterThan(0);
    });
});

describe('healing already-poisoned profiles', () => {
    test('the old bad values are detected as corrupt', () => {
        expect(isCorruptedName('أريد')).toBe(true);
        expect(isCorruptedName('building')).toBe(true);
        expect(isCorruptedName('12ab')).toBe(true);
    });
    test('a real name is NOT flagged', () => {
        expect(isCorruptedName('يونس')).toBe(false);
        expect(isCorruptedName('Younes')).toBe(false);
    });
});

describe('Arabic-aware recall matching', () => {
    test('proclitic and hamza differences no longer hide a match', () => {
        expect(normalizeForMatch('البرمجة')).toContain(normalizeForMatch('برمجه').replace('ال', ''));
        expect(normalizeForMatch('أريد')).toBe(normalizeForMatch('اريد'));
        expect(normalizeForMatch('القاهرة')).toBe(normalizeForMatch('القاهره'));
    });
});
