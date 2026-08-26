/**
 *  A WORD THIS FILE ALREADY KNOWS AS AN INTRODUCER MAY NOT OPEN A LIST.
 *
 *  Four phrasings of one request, measured:
 *
 *      «Build an expenses app. Columns: date, amount, category and note»
 *          → date · amount · category · note
 *      «Build an expenses app. The fields are date, amount, category…»
 *          → date · amount · category · note
 *      «Build a small expenses app. Include date, amount, category and note.»
 *          → NOTHING
 *      «Build an expenses app with date, amount, category and note.»
 *          → NOTHING
 *
 *  «include» and «with» are already in this file's introducer set —
 *  firstColumnBeginsAtTheName strips them off the first column every day.
 *  They were known as words that HAND OVER to a list and not as words
 *  that OPEN one, so the same request read two ways depending on whether
 *  a container noun happened to stand nearby.
 *
 *  THE CASE THIS MUST NOT SWALLOW:
 *
 *      «Build a small portfolio site with a home page, a projects page
 *       and a contact form.»
 *
 *  Same word, same shape — and every item begins with an ARTICLE. A
 *  column he names is «date»; a thing he asks to be built is «a home
 *  page». English marks that with a closed class of three words, and
 *  that is the whole test: no catalogue of page names, no list of field
 *  names.
 */
import { derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);

describe('the four ways he might write one request all read the same', () => {
    const EXPECTED = ['date', 'amount', 'category', 'note'];
    const SAME: Array<[string, string]> = [
        ['a colon after «Columns»', 'Build an expenses app. Columns: date, amount, category and note.'],
        ['«The fields are»', 'Build an expenses app. The fields are date, amount, category and note.'],
        ['a bare imperative «Include»', 'Build a small expenses app. Include date, amount, category and note.'],
        ['«with», and no container noun anywhere', 'Build an expenses app with date, amount, category and note.'],
    ];
    for (const [name, request] of SAME) {
        it(name, () => expect(labels(request)).toEqual(EXPECTED));
    }

    it('a trade nobody has heard of reads the same way', () => {
        expect(labels('Build a zurqumony app. Include vendor, ration, sigil and weight.'))
            .toEqual(['vendor', 'ration', 'sigil', 'weight']);
    });
});

describe('…and a list of things to BUILD is not a list of columns', () => {
    it('pages asked for, each with its article', () => {
        expect(derivedColumns('Build a small portfolio site with a home page, a projects page and a contact form.'))
            .toBeNull();
    });

    it('the reference prompt still declares no schema', () => {
        expect(derivedColumns('Build a small project called Gate062. Create one polished page titled '
            + 'Gate 062 with a heading, a short status message, and a button that increments a visible counter.'))
            .toBeNull();
    });

    it('two items after «with» are prose, not a schema', () => {
        //  The floor of three is kept: no container stands here to lower it.
        expect(derivedColumns('Build an app with speed and simplicity')).toBeNull();
    });

    it('a capability after the run is still cut', () => {
        expect(labels('Build an expenses app. Include date, amount and note, with search by date.'))
            .toEqual(['date', 'amount', 'note']);
    });
});

describe('and the readers in front of it still answer first', () => {
    const UNMOVED: Array<[string, string[]]> = [
        ['بدي جدول للكتب فيه العنوان والسعر', ['العنوان', 'السعر']],
        ['A clients table with name, phone and address', ['name', 'phone', 'address']],
        ['بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم',
            ['زبائني', 'ارقام تلفوناتهم', 'عناوينهم']],
    ];
    for (const [request, expected] of UNMOVED) {
        it(request.slice(0, 44), () => expect(labels(request)).toEqual(expected));
    }

    it('a greeting is still nothing', () => expect(derivedColumns('مرحبا')).toBeNull());
});
