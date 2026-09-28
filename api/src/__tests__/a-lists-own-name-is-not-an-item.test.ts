/**
 *  THE LIST'S OWN NAME IS NOT ITS LAST ITEM'S NAME.
 *
 *  Measured live (CRITICAL-REAL-JOE-UI-001 runs 19-20): a prompt asking for
 *  "tool, borrower and due columns" built an app whose schema read «due
 *  columns» as one label — and «address columns», «hours columns», «period
 *  columns» the same way. The generated columns, seeds and smoke tests all
 *  carried the infidelity: the app proved a label the user never wrote.
 *
 *  The cause is English list grammar. «columns»/«fields» after the last item
 *  names the LIST, not the item — it is shared across the whole enumeration
 *  ("name, phone and address columns" is three columns, the third called
 *  «address»). One reader already knew half of this: the introducer branch
 *  strips a trailing «fields», which is why "year fields" read «year» while
 *  "due columns" read «due columns». The recording branch, the container
 *  branch and the form reader knew neither half, so two-item lists kept
 *  «phone fields» too.
 *
 *  The repair is one law applied at every English enumeration site: a
 *  trailing category noun that names the list itself («column», «columns»,
 *  «field», «fields») is the enumeration's, not the item's, and comes off
 *  before the item is named. A bare «columns» with no name in front of it
 *  is left alone — there is no item to attribute it to, and the reader
 *  does not eat words it cannot place.
 */
import { derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);

describe('a trailing list-category noun belongs to the list, not the item', () => {
    it('introducer list: due columns', () => {
        expect(labels('A loans table with tool, borrower and due columns'))
            .toEqual(['tool', 'borrower', 'due']);
    });

    it('introducer list: note columns', () => {
        expect(labels('Add amount, category, date, and note columns'))
            .toEqual(['amount', 'category', 'date', 'note']);
    });

    it('recording list: due columns', () => {
        expect(labels('record tools: tool, borrower and due columns'))
            .toEqual(['tool', 'borrower', 'due']);
    });

    it('singular column', () => {
        expect(labels('A books table with title and author column'))
            .toEqual(['title', 'author']);
    });

    it('container list strips fields the way the introducer already does', () => {
        expect(labels('a table with name and phone fields'))
            .toEqual(['name', 'phone']);
    });

    it('form list: phone columns', () => {
        expect(labels('a form with name, email and phone columns'))
            .toEqual(['name', 'email', 'phone']);
    });

    it('mid-list attachment: name columns', () => {
        expect(labels('A table with name columns, phone and address'))
            .toEqual(['name', 'phone', 'address']);
    });
});

describe('and what the law does not touch', () => {
    it('a bare columns with no name in front of it is left alone', () => {
        expect(labels('A table with name, phone and columns'))
            .toEqual(['name', 'phone', 'columns']);
    });

    it('plain lists without a category noun read as before', () => {
        expect(labels('A clients table with name, phone and address'))
            .toEqual(['name', 'phone', 'address']);
    });
});
