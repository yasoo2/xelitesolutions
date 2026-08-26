/**
 *  A READER OF HIS WORDS WAS HANDED JOE'S OWN PAPERWORK.
 *
 *  Live round, rung 08. He wrote one Arabic sentence and nothing else:
 *
 *      «بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم»
 *
 *  and the page that came back opened with
 *
 *      <title>AUTHORITATIVE — العملاء</title>
 *      package.json  "name": "authoritative"
 *      folders        react-authoritative-260f36f8 · api-authoritative-335d
 *
 *  «العملاء» is his, read correctly from «زبائني». «AUTHORITATIVE» is the
 *  first word of a block JOE appends to its own planning text.
 *
 *  Measured before the fix, with the inputs:
 *
 *      his sentence alone                          → ''
 *      + «AUTHORITATIVE DISCOVERY EVIDENCE — …»     → 'AUTHORITATIVE'
 *      + «--- COMPACT REQUIREMENTS EVIDENCE … ---»  → 'COMPACT'
 *
 *  Two different words: banning one would have fixed one live round and left
 *  the defect standing. What broke is that the text reaching a reader of his
 *  words stopped being his.
 */
import { brandFrom, hisWordsOnly } from '../core/design/page-head';

const HIS = 'بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم';
const DISCOVERY = '\n\nAUTHORITATIVE DISCOVERY EVIDENCE — these are the only known project roots, manifests, entrypoints, source files, and tests.';
const COMPACT = '\n\n--- COMPACT REQUIREMENTS EVIDENCE (derived from complete local files read through read_file) ---\nAUTHORITATIVE REQUIREMENTS EVIDENCE';

describe('Joe does not name a project after its own paperwork', () => {
    it('the exact live round: his sentence plus the discovery block', () => {
        expect(brandFrom(HIS + DISCOVERY, true)).toBe('');
    });

    it('…and the other block, whose first word is a different one', () => {
        //  This is why a banned-word list would not have been a fix.
        expect(brandFrom(HIS + COMPACT, true)).toBe('');
    });

    it('…and both at once', () => {
        expect(brandFrom(HIS + DISCOVERY + COMPACT, true)).toBe('');
    });
});

describe('…and a name he did write still reaches the page', () => {
    it('a Latin brand inside his Arabic sentence', () => {
        expect(brandFrom('بدي موقع لشركة Ravelkit فيه صفحة واحدة', true)).toBe('Ravelkit');
    });

    it('…even when the paperwork follows it', () => {
        //  The positive case has to survive the guard, or the guard is a
        //  deletion rather than a fix.
        expect(brandFrom('بدي موقع لشركة Ravelkit فيه صفحة واحدة' + DISCOVERY, true)).toBe('Ravelkit');
    });

    it('an all-caps brand standing alone is a brand', () => {
        expect(brandFrom('بدي موقع لشركة IKEA', true)).toBe('IKEA');
    });

    it('two all-caps words are still a brand — the line is drawn at three', () => {
        expect(brandFrom('بدي موقع لشركة IBM MEA', true)).toBe('IBM');
    });

    it('a name he introduced explicitly is untouched by any of this', () => {
        expect(brandFrom('Build a small project called Gate062 with one page.')).toBe('Gate062');
    });
});

describe('hisWordsOnly keeps what is his and drops what is not', () => {
    it('a plain request comes back whole', () => {
        expect(hisWordsOnly(HIS)).toBe(HIS);
    });

    it('an English request comes back whole', () => {
        const en = 'Build a small project called Ravelkit with a search input.';
        expect(hisWordsOnly(en)).toBe(en);
    });

    it('a single newline inside his own message is not a boundary', () => {
        //  He does press Enter. One line break is his; a blank line is Joe's.
        expect(hisWordsOnly('بدي جدول\nفيه الاسم والهاتف')).toBe('بدي جدول\nفيه الاسم والهاتف');
    });

    it('the appended block is dropped, the sentence kept', () => {
        expect(hisWordsOnly(HIS + DISCOVERY)).toBe(HIS);
    });

    it('a fence is a boundary even with no blank line before it', () => {
        expect(hisWordsOnly(HIS + '\n--- COMPACT REQUIREMENTS EVIDENCE ---\nx')).toBe(HIS);
    });

    it('a shouted heading is a boundary even with no fence and no blank line', () => {
        expect(hisWordsOnly(HIS + ' AUTHORITATIVE DISCOVERY EVIDENCE — roots')).toBe(HIS);
    });

    it('text that is nothing but paperwork comes back empty, not whole', () => {
        //  The honest answer when none of it is his.
        expect(hisWordsOnly('AUTHORITATIVE REQUIREMENTS EVIDENCE (derived from the specification)')).toBe('');
    });
});
