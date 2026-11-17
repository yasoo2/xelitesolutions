/**
 *  THE WORD «LIST» ASKS. THE ITEMS ANSWER.
 *
 *  c8f79de26 made a rule run that had been dead since a capture group was
 *  dropped: «a bare list holds values». It was right about milk:
 *
 *      «A shopping list with milk, bread and eggs»   → no columns
 *
 *  and the pre-merge review measured what it did to everything else that
 *  English calls a list, against the parent commit:
 *
 *      «Build a contact list with name, phone and email»
 *          parent: name · phone · email, schema, generic, 3 column criteria
 *          then:   no columns, no schema, kind null
 *      «Create an employee list: name, department, salary»       → kind null
 *      «Create a list of my customers with name, phone and city»  → kind null
 *      «Create a todo list with title, due date and priority»     → tasks, criteria gone
 *      «Make a guest list app with name, RSVP status and table number» → custom
 *      «Build a reading list app with title, author and status»   → custom
 *
 *  English has one word for both containers. A shopping list holds things;
 *  a contact list holds a name, a phone and an email FOR EACH contact. The
 *  word cannot tell them apart, so the rule now asks the items: a column
 *  has a kind of value — the type marks that type every derived column read
 *  «phone» as a tel, «due date» as a date, «salary» as money, «RSVP status»
 *  as a select — or it is the record's own name or title. Milk has no kind
 *  of value. Milk IS the value.
 *
 *  The Arabic twins never depended on the word: an Arabic column is
 *  definite («الاسم») and a value is not («حليب»). They are pinned here so
 *  the two halves stay one reader.
 *
 *  And two readers on the same path were slow enough to count as broken:
 *  the container finder folded the whole request once per container it
 *  found (5 KB of «list list …» took 16–20 s), and the list separator
 *  retried a long run of spaces from every position in it (0.6–1.4 s on
 *  5 KB). Both are linear now: milliseconds at twice and four times that.
 */
import { derivedColumns, detectAppKind, hasExplicitRecordSchema } from '../core/design/app-blueprints';
import { acceptanceFor } from '../core/quality/acceptance';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);
const columnCriteria = (r: string) => acceptanceFor(r).map(c => c.id).filter(id => id.startsWith('column:'));

interface Twin { en: string; enColumns: string[]; ar: string; arColumns: string[]; criteria: string[] }

//  Every expectation below is what the parent commit 239091867 gave, read
//  back from it — the review's table, restored, not a new opinion.
const TWINS: Twin[] = [
    {
        en: 'Build a contact list with name, phone and email',
        enColumns: ['name', 'phone', 'email'],
        ar: 'ابن قائمة جهات اتصال فيها الاسم والهاتف والبريد',
        arColumns: ['الاسم', 'الهاتف', 'البريد'],
        criteria: ['column:text1', 'column:tel1'],
    },
    {
        en: 'Create an employee list: name, department, salary',
        enColumns: ['name', 'department', 'salary'],
        ar: 'أنشئ قائمة موظفين: الاسم، القسم، الراتب',
        arColumns: ['الاسم', 'القسم', 'الراتب'],
        criteria: ['column:text1', 'column:text2', 'column:money1'],
    },
    {
        en: 'Create a list of my customers with name, phone and city',
        enColumns: ['name', 'phone', 'city'],
        ar: 'أنشئ قائمة بعملائي فيها الاسم والهاتف والمدينة',
        arColumns: ['الاسم', 'الهاتف', 'المدينة'],
        criteria: ['column:text1', 'column:tel1', 'column:text2'],
    },
    {
        en: 'Create a todo list with title, due date and priority',
        enColumns: ['title', 'due date', 'priority'],
        ar: 'أنشئ قائمة مهام فيها العنوان وتاريخ الاستحقاق والأولوية',
        arColumns: ['العنوان', 'تاريخ الاستحقاق', 'الأولوية'],
        criteria: ['column:title', 'column:date1', 'column:text2'],
    },
    {
        en: 'Make a guest list app with name, RSVP status and table number',
        enColumns: ['name', 'RSVP status', 'table number'],
        ar: 'اعمل تطبيق قائمة ضيوف فيه الاسم وحالة الحضور ورقم الطاولة',
        arColumns: ['الاسم', 'حالة الحضور', 'رقم الطاولة'],
        criteria: ['column:text1', 'column:flag1', 'column:text2'],
    },
    {
        en: 'Build a reading list app with title, author and status',
        enColumns: ['title', 'author', 'status'],
        ar: 'ابن تطبيق قائمة قراءة فيه العنوان والمؤلف والحالة',
        arColumns: ['العنوان', 'المؤلف', 'الحالة'],
        criteria: ['column:title', 'column:text2', 'column:flag1'],
    },
];

describe('a list of fields is his table — in English', () => {
    for (const twin of TWINS) {
        it(`«${twin.en}» keeps its columns, its schema and its criteria`, () => {
            expect(labels(twin.en)).toEqual(twin.enColumns);
            expect(hasExplicitRecordSchema(twin.en)).toBe(true);
            //  A request that names its columns is his app, not a stock one.
            expect(detectAppKind(twin.en)).toBe('generic');
            const criteria = columnCriteria(twin.en);
            expect(criteria).toHaveLength(twin.enColumns.length);
            for (const id of twin.criteria) expect(criteria).toContain(id);
        });
    }

    it('the contact list owes an email column, typed as one', () => {
        expect(columnCriteria('Build a contact list with name, phone and email'))
            .toEqual(['column:text1', 'column:tel1', 'column:email1']);
    });
});

describe('…and in Arabic, which never needed the word', () => {
    for (const twin of TWINS) {
        it(`«${twin.ar}» keeps its columns, its schema and its criteria`, () => {
            expect(labels(twin.ar)).toEqual(twin.arColumns);
            expect(hasExplicitRecordSchema(twin.ar)).toBe(true);
            expect(detectAppKind(twin.ar)).toBe('generic');
            const criteria = columnCriteria(twin.ar);
            expect(criteria).toHaveLength(twin.arColumns.length);
            for (const id of twin.criteria) expect(criteria).toContain(id);
        });
    }

    it('the sentences as the review wrote them, with no verb, still name the columns', () => {
        expect(labels('قائمة جهات اتصال فيها الاسم والهاتف والبريد')).toEqual(['الاسم', 'الهاتف', 'البريد']);
        expect(labels('قائمة موظفين: الاسم، القسم، الراتب')).toEqual(['الاسم', 'القسم', 'الراتب']);
    });
});

describe('a list of things is still a list of things', () => {
    it('milk, bread and eggs are what the list holds', () => {
        expect(derivedColumns('A shopping list with milk, bread and eggs')).toBeNull();
        expect(hasExplicitRecordSchema('A shopping list with milk, bread and eggs')).toBe(false);
    });

    it('…even when he asks for an app to hold them', () => {
        //  The parent built this one as a records app with a column called
        //  «milk»: the build verb is there, the fields are not.
        expect(derivedColumns('Build a shopping list app with milk, bread and eggs')).toBeNull();
        expect(hasExplicitRecordSchema('Build a shopping list app with milk, bread and eggs')).toBe(false);
        expect(columnCriteria('Build a shopping list app with milk, bread and eggs')).toEqual([]);
    });

    it('the values of a field are not columns', () => {
        expect(derivedColumns('a list of categories: coffee, tools, sweets')).toBeNull();
        expect(columnCriteria('a list of categories: coffee, tools, sweets')).toEqual([]);
    });

    it('a state named on its own is the answer of a status, not a column', () => {
        //  «done» is read by the yes/no mark — as a column it would be a
        //  question. Listed beside «pending» it is one of a status's answers.
        expect(derivedColumns('Create a list of statuses: pending, done, cancelled')).toBeNull();
    });

    it('a title he names is a thing, even when a type mark is inside it', () => {
        //  «time» is a type mark; «The Time Machine» opens with an article,
        //  and an item that does is a thing he names, not a column.
        expect(derivedColumns('A reading list: Dune, The Time Machine, Emma')).toBeNull();
    });

    it('the Arabic shopping list is still refused, with or without a verb', () => {
        expect(derivedColumns('قائمة تسوق فيها حليب وخبز وبيض')).toBeNull();
        expect(derivedColumns('ابن قائمة تسوق فيها حليب وخبز وبيض')).toBeNull();
    });
});

describe('the readers on this path stay linear', () => {
    //  Larger than the 5 KB that was measured, so the old shape cannot pass
    //  by luck on a fast machine: quadratic work grows four times when the
    //  input doubles (old: ~60 s and ~9 s here), linear work stays in
    //  milliseconds, and the bound leaves room for a loaded laptop.
    const BOUND_MS = 3000;
    const timed = (text: string): number => {
        const t0 = Date.now();
        derivedColumns(text);
        hasExplicitRecordSchema(text);
        return Date.now() - t0;
    };

    it('a request that names a container a thousand times is folded once', () => {
        let text = 'Build ';
        while (text.length < 10_000) text += 'list ';
        text += 'with name, phone and email';
        expect(timed(text)).toBeLessThan(BOUND_MS);
    });

    it('a long run of spaces is not retried from every position in it', () => {
        const text = `Build a list${' '.repeat(20_000)}with name, phone and email`;
        expect(timed(text)).toBeLessThan(BOUND_MS);
        //  …and collapsing the run changes nothing he wrote.
        expect(labels(text)).toEqual(labels('Build a list with name, phone and email'));
    });
});
