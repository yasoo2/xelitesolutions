import {
    blueprintFor,
    detectAppKind,
    derivedColumns,
    uncoveredFeatures,
} from '../core/design/app-blueprints';
import { verifyNamed, type NamedRequirement } from '../core/quality/named-requirements';

const REQUEST = 'Create a repair-shop customer directory with name, phone, email, device, warranty expiry, repair status, empty-name validation, search, and status filtering.';

describe('a natural-language directory request keeps fields and behaviours separate', () => {
    it('recognises a directory as a records application and keeps only data fields', () => {
        expect(detectAppKind(REQUEST)).toBe('generic');
        expect(derivedColumns(REQUEST)?.map(field => field.label)).toEqual([
            'name', 'phone', 'email', 'device', 'warranty expiry', 'repair status',
        ]);
    });

    it('turns the named status into a real filter contract', () => {
        const bp = blueprintFor('generic', REQUEST, false);
        expect(bp.fields.map(field => field.label)).toEqual([
            'name', 'phone', 'email', 'device', 'warranty expiry', 'repair status',
        ]);
        expect(bp.statusField).toBe('flag1');
        expect(bp.fields.find(field => field.key === bp.statusField)?.options)
            .toEqual(['Pending', 'In progress', 'Completed']);
    });

    it('does not mark a field or action covered without source evidence', () => {
        const source = `
          const content = { fields: [{ label: 'name' }, { label: 'phone' },
            { label: 'repair status' }], statusField: 'flag1' };
          const [query, setQuery] = useState(''); const [filter, setFilter] = useState('');
          const visible = rows.filter(row => !filter || row.status === filter);
          const submit = (event) => { event.preventDefault(); setError('Required'); };
          const csv = toCsv(visible); download('records.csv', csv);
        `;
        expect(uncoveredFeatures(REQUEST, 'records', false, source)).toEqual([
            'email', 'device', 'warranty expiry',
        ]);
    });
});

describe('record schema evidence is not delegated to a weak provider', () => {
    it('accepts declared fields and actions when the provider is unavailable', async () => {
        const req = (id: string, text: string): NamedRequirement => ({ id, text, quote: text });
        const source = `label: 'name' label: 'phone' label: 'repair status'
          const [query, setQuery] = useState(''); const [filter, setFilter] = useState('');
          const visible = rows.filter(row => !filter || row.status === filter);
          <input required /> setError('Required'); toCsv(visible); download('rows.csv', csv);`;
        const result = await verifyNamed([
            req('name', 'name'), req('phone', 'phone'), req('search', 'search'),
            req('status', 'status filtering'), req('validation', 'empty-name validation'),
            req('export', 'export CSV'),
        ], source, false, async () => { throw new Error('provider unavailable'); });
        expect(result.map(item => item.verdict)).toEqual(['met', 'met', 'met', 'met', 'met', 'met']);
    });
});
