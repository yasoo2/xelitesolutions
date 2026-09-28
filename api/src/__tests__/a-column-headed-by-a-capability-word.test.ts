/**
 *  A COLUMN HEADED BY A CAPABILITY WORD IS STILL A COLUMN.
 *
 *  Measured, five real names this reader threw away:
 *
 *      «A branches table with name, sort code and address»       → null
 *      «A users table with name, search history and email»       → null
 *      «A products table with name, filter type and price»       → null
 *      «A shipments table with id, export license and destination» → null
 *      «A diagnostics table with id, error code and timestamp»   → null
 *
 *  Each lost its middle item to CAPABILITY_CLAUSE, and the two that
 *  remained sank below the floor — so the whole request read as no
 *  schema at all. «sort code» is a bank column, «search history» a
 *  user column, «filter type» a product column, «export license» a
 *  shipment column, «error code» a diagnostics column. None of them
 *  asks the app to DO anything.
 *
 *  The cause is the missing half of a boundary: every English branch
 *  of CAPABILITY_CLAUSE is anchored at the start of the item but open
 *  at the end, so «sort» matches «sort code» and «search» matches
 *  «search history». The Arabic branches end in (?:\s|$) and the
 *  neighbour guard OPENS_A_NEW_REQUEST ends in (?=$|[\s،,]) — only
 *  the English capability branches were left unclosed.
 *
 *  The repair closes them with capability continuations, not with a
 *  bare word boundary: a leading capability word still cuts the item
 *  when nothing follows it («loading», «validation»), when a state
 *  word follows it («error states»), when a listed format follows it
 *  («export csv»), or when a container adjunct follows it («sort by
 *  grade», «export to csv»). What follows it in the five cases
 *  above is a plain noun — «code», «history», «type», «license» —
 *  and a capability word heading a noun phrase names a column. A
 *  gerund-looking noun («search string», «error handling») is a noun
 *  all the same: no pinned case needs an -ing continuation, and
 *  over-cutting below the floor costs the whole schema.
 *
 *  Deliberately still open: the -able adjective («sortable by
 *  grade», «filterable by class») reads as a column again once the
 *  accidental prefix match is gone. That restores the limitation
 *  declared in a-capability-is-not-a-column.test.ts — closing it
 *  needs a signal this function does not have, and an accident is
 *  not a signal.
 */
import { derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);

describe('a name headed by a capability word is read, not cut', () => {
    it('sort code', () => {
        expect(labels('A branches table with name, sort code and address'))
            .toEqual(['name', 'sort code', 'address']);
    });

    it('search history', () => {
        expect(labels('A users table with name, search history and email'))
            .toEqual(['name', 'search history', 'email']);
    });

    it('filter type', () => {
        expect(labels('A products table with name, filter type and price'))
            .toEqual(['name', 'filter type', 'price']);
    });

    it('export license', () => {
        expect(labels('A shipments table with id, export license and destination'))
            .toEqual(['id', 'export license', 'destination']);
    });

    it('error code', () => {
        expect(labels('A diagnostics table with id, error code and timestamp'))
            .toEqual(['id', 'error code', 'timestamp']);
    });

    it('sort order', () => {
        expect(labels('A playlists table with name, sort order and public'))
            .toEqual(['name', 'sort order', 'public']);
    });

    it('loading dock', () => {
        expect(labels('A warehouses table with name, loading dock and capacity'))
            .toEqual(['name', 'loading dock', 'capacity']);
    });

    it('search string', () => {
        //  Ends in -ing and is a noun all the same: the query text he
        //  stored, not a request to search. This pins the decision not
        //  to close the branches with a gerund continuation.
        expect(labels('A queries table with name, search string and created'))
            .toEqual(['name', 'search string', 'created']);
    });

    it('error handling', () => {
        //  Behaviour-shaped and kept as a name: parallel to «error
        //  code», and no pinned case cuts a two-word -ing item through
        //  this branch («status filtering» has its own branch below).
        expect(labels('A services table with name, error handling and retries'))
            .toEqual(['name', 'error handling', 'retries']);
    });

    it('export overview', () => {
        //  The adjunct continuation is whole-word: «overview» opens with
        //  «over» but the \b refuses to split it into «over» + «view»,
        //  so the overview of his exports stays a column.
        expect(labels('A reports table with title, export overview and date'))
            .toEqual(['title', 'export overview', 'date']);
    });
});

describe('and a real capability beside the list is still cut', () => {
    it('sort by grade', () => {
        expect(labels('A students table with name, class and grade, sort by grade'))
            .toEqual(['name', 'class', 'grade']);
    });

    it('search by name', () => {
        expect(labels('A students table with name, class and grade, search by name'))
            .toEqual(['name', 'class', 'grade']);
    });

    it('bare state words', () => {
        expect(derivedColumns('Build a page with loading, filtering, validation, and error states.'))
            .toBeNull();
    });

    it('status filtering', () => {
        expect(labels('An orders table with id, customer and total, status filtering'))
            .toEqual(['id', 'customer', 'total']);
    });

    it('export to csv', () => {
        //  The adjunct class is broader than «by»: «to» opens the same
        //  continuation, so the behaviour beside the list is still cut.
        expect(labels('An orders table with id, customer and total, export to csv'))
            .toEqual(['id', 'customer', 'total']);
    });

    it('export csv', () => {
        expect(labels('An orders table with id, customer and total, export csv'))
            .toEqual(['id', 'customer', 'total']);
    });
});

describe('the -able boundary, declared and not hidden', () => {
    it('sortable by grade reads as a column until a real signal closes it', () => {
        //  The companion file a-capability-is-not-a-column.test.ts declares
        //  this limitation; it is repeated here so the restored behaviour
        //  is deliberate rather than a surprise.
        expect(labels('A students table with name, class and grade, sortable by grade'))
            .toEqual(['name', 'class', 'grade', 'sortable by grade']);
    });
});
