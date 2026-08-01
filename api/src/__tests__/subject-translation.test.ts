/**
 * Why every Arabic build shipped gradients where photographs belonged.
 *
 * The archives (Openverse, Wikimedia Commons, Pexels, Unsplash) title and tag
 * their photographs in English. An Arabic page asks for Arabic subjects, and
 * the relevance gate compared Arabic query words against English evidence —
 * zero matches, for every candidate, always. The archives were never empty;
 * the question was asked in a language the catalogue does not index.
 *
 * englishSubject translates by DICTIONARY — deterministic, instant, alive
 * when every LLM provider is dead. It feeds the search and the gate only;
 * the alt text a screen reader hears stays in the page's own language.
 */
import * as fs from 'fs';
import * as path from 'path';
import { englishSubject } from '../core/design/subject-translation';

describe('englishSubject — the exact subjects from the user\'s broken build', () => {
    it('«مطور برمجيات يعمل على حلول تكنولوجية» reaches the archives as English', () => {
        const r = englishSubject('مطور برمجيات يعمل على حلول تكنولوجية');
        expect(r.translated).toBe(true);
        for (const w of ['developer', 'software', 'working', 'solutions', 'technology']) {
            expect(r.query).toContain(w);
        }
        expect(r.query).not.toMatch(/[؀-ۿ]/);
    });

    it.each([
        ['استشارات برمجية', ['consulting', 'software']],
        ['طاهٍ يطبخ في مطبخ مطعم', ['cooking', 'kitchen', 'restaurant']],
        ['فريق عمل في اجتماع بالمكتب', ['team', 'work', 'meeting', 'office']],
        ['طبيبة في عيادة أسنان', ['doctor', 'clinic', 'dental']],
        ['مهندس في موقع بناء', ['engineer', 'construction']],
    ])('%s → %j', (ar, words) => {
        const r = englishSubject(String(ar));
        expect(r.translated).toBe(true);
        for (const w of words) expect(r.query).toContain(w);
    });

    it('an English subject passes through byte for byte', () => {
        const r = englishSubject('software developer portrait');
        expect(r.translated).toBe(false);
        expect(r.query).toBe('software developer portrait');
    });

    it('a Latin brand inside an Arabic subject survives as its own search term', () => {
        const r = englishSubject('فريق شركة xelitesolutions في المكتب');
        expect(r.query).toContain('xelitesolutions');
        expect(r.query).toContain('team');
        expect(r.query).toContain('office');
    });

    it('spelling variants normalize to the same lookup: أ/ا, ة/ه, definite article', () => {
        expect(englishSubject('المطوّر').query).toBe(englishSubject('مطور').query);
        expect(englishSubject('شركة').query).toBe(englishSubject('شركه').query);
    });

    it('a subject with no recognizable words falls back to the original — Commons\' own Arabic search still gets its chance', () => {
        const r = englishSubject('الخوارزمي البيروني');
        expect(r.translated).toBe(false);
        expect(r.query).toBe('الخوارزمي البيروني');
    });

    it('the query is capped — six precise words beat a paragraph', () => {
        const r = englishSubject('مطور مهندس طبيب معلم طاهي مصور محامي مزارع عامل');
        expect(r.query.split(' ').length).toBeLessThanOrEqual(6);
    });
});

describe('the translation feeds the search and the gate — never the alt text', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'design', 'images.ts'), 'utf-8');

    it('sourceImage searches and gates with the translated query', () => {
        expect(src).toMatch(/searchAllSources\(searchQuery, timeoutMs, wanted\)/);
        expect((src.match(/isRelevant\(searchQuery,/g) || []).length).toBeGreaterThanOrEqual(3);
        expect(src).toMatch(/scoreCandidate\(searchQuery, slot,/);
    });

    it('the alt text stays as the page wrote it', () => {
        // Every alt assignment uses the ORIGINAL query, never searchQuery.
        expect(src).not.toMatch(/alt:\s*searchQuery/);
        expect(src).toMatch(/alt:\s*query/);
    });

    it('the build log reports how many subjects were translated', () => {
        expect(src).toMatch(/translatedQueries: tally\.translated/);
    });
});

describe('gap-fill: subjects that MEASURED as passthrough now translate', () => {
    // Each of these fell to a gradient because the dictionary did not know the
    // words — proven by a coverage probe, fixed by adding the vocabulary.
    const cases: Array<[string, RegExp]> = [
        ['شقة حديثة للبيع', /apartment|for sale/],
        ['ملعب كرة قدم', /stadium|football/],
        ['صالون تجميل', /salon|beauty/],
        ['قاعة أفراح', /hall|wedding/],
        ['طائرة في السماء', /airplane|sky/],
    ];
    for (const [subject, expected] of cases) {
        it(`«${subject}» now reaches the archives in English`, () => {
            const r = englishSubject(subject);
            expect(r.translated).toBe(true);
            expect(r.query).not.toMatch(/[؀-ۿ]/); // no Arabic left in the search query
            expect(r.query).toMatch(expected);
        });
    }
});
