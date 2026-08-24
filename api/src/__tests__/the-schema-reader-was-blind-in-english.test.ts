/**
 *  THE SCHEMA READER WAS BLIND IN ENGLISH.
 *
 *  The same sentence in two scripts:
 *
 *      «بدي جدول للعملاء فيه الاسم والهاتف والعنوان»  → 3 columns
 *      «A clients table with name, phone and address»  → null
 *
 *  Not «read badly» — never read at all. The shape path ends in a test for
 *  definiteness, and definiteness there means «ال» or a possessive suffix.
 *  No English noun carries either, so that test could NEVER pass and every
 *  English request in the world fell through to a memorised template: he
 *  asked for name, phone and address and got somebody else's idea of a
 *  clients app.
 *
 *  English marks the difference on the CONTAINER instead of the noun. «name»
 *  is as bare in English as «قهوة» is in Arabic; what keeps a shopping list
 *  out is that a list holds things while a table holds columns.
 */
import { derivedColumns } from '../core/design/app-blueprints';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);

describe('an English request is read, not guessed at', () => {
    it('a table with three attributes gives three columns', () => {
        expect(labels('A clients table with name, phone and address')).toEqual(['name', 'phone', 'address']);
    });

    it('«of» reads the same as «with» — the preposition is not the signal', () => {
        expect(labels('A table of name, phone and address')).toEqual(['name', 'phone', 'address']);
    });

    it('a tracker reads like a table', () => {
        expect(labels('An orders tracker with customer, quantity and total')).toEqual(['customer', 'quantity', 'total']);
    });

    it('a word this repository has never seen reads the same way', () => {
        //  «zurqumony» is not a domain, a framework or an app shape. If a
        //  catalogue were doing the reading, this would return nothing.
        expect(labels('A zurqumony table with vendor, ration and sigil')).toEqual(['vendor', 'ration', 'sigil']);
    });
});

describe('…and a list of values is still not a schema', () => {
    it('a shopping list holds things, not columns', () => {
        //  The English negative that Arabic gets for free from definiteness:
        //  milk is a value. Read as a schema this becomes an app about milk.
        expect(derivedColumns('A shopping list with milk, bread and eggs')).toBeNull();
    });

    it('a list after a field noun holds that field\u2019s values', () => {
        expect(derivedColumns('a list of categories: coffee, tools, sweets')).toBeNull();
    });

    it('prose with no container is prose', () => {
        expect(derivedColumns('I like name, phone and address as ideas')).toBeNull();
    });
});

describe('Arabic is untouched — the fix did not move the other half', () => {
    it('the Arabic table still gives its columns', () => {
        expect(labels('بدي جدول للكتب فيه العنوان والسعر')).toEqual(['العنوان', 'السعر']);
    });

    it('the Arabic list of values is still refused', () => {
        expect(derivedColumns('متجر بفئات: قهوة، أدوات، حلويات')).toBeNull();
    });
});
