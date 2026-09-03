/**
 * JOE TOLD HIM THE APP FILTERS. THE APP HAS NO FILTER.
 *
 * Measured on the sales table he asked for — three columns, none of them a
 * status. The delivery said, among the capabilities it claimed to have proven:
 *
 *     • instant search, filter and sort
 *
 * The proof behind it was `hasAll(/search/i, /filter/i, /sort/i)` against the
 * generated source. `filter` and `sort` are JavaScript's own array methods:
 * `fields.filter(f => …)` and `rows.sort(…)` are in every React file Joe has
 * ever written. The claim could not fail, so it never did.
 *
 * The class is the one that keeps coming back: A PROOF MATCHING THE SHAPE OF A
 * TOKEN INSTEAD OF THE CLAIM — the same defect as the ✅ on his zero-price rule
 * being earned by any `min:` and a digit. Here it is worse in one way: this
 * list is Joe telling him what the app CAN DO. A wrong entry sends him looking
 * for a control that was never built.
 *
 * A capability is now proven by the STATE its control drives, and the filter
 * also by something to filter on — its select renders only when a select
 * column exists, so without one the markup never appears on screen.
 */

import { measuredAppAbilities } from '../modules/tools/definitions/ReactProjectTool';

/** The shape of a real records app, with the parts under test swapped in. */
const app = (opts: { search?: boolean; filter?: boolean; sort?: boolean; statusColumn?: boolean }) => `
  export default function RecordsApp({ content }) {}
  const fields = content.fields.filter(f => f.type !== 'image');
  const visible = rows.filter(r => true).sort((a, b) => 0);
  ${opts.search === false ? '' : 'const onSearch = e => setQuery(e.target.value);'}
  ${opts.filter === false ? '' : 'const onFilter = e => setFilter(e.target.value);'}
  ${opts.sort === false ? '' : 'const onSort = e => setSort(e.target.value);'}
  export const content = { fields: [
    { key: 'text1', label: 'اسم الصنف', type: 'text', required: true, primary: true },
    { key: 'money1', label: 'السعر', type: 'number' }${opts.statusColumn ? `,
    { key: 'status', label: 'الحالة', type: 'select', options: ['جديد', 'منجز'] }` : ''}
  ] };
  const t = toCsv(fields, visible); localStorage.setItem('k', '1');
  const add = () => setRows([...rows]); const update = () => {}; const remove = () => {};
  const required = true; const total = visible.reduce((a, b) => a, 0);
`;

const claimed = (src: string) =>
    measuredAppAbilities('records', false, src).abilities.join(' | ');

describe('a capability is claimed only when its control exists', () => {
    it('the report is produced at all — an empty list proves nothing', () => {
        const r = measuredAppAbilities('records', false, app({ statusColumn: true }));
        expect(r.measured).toBe(true);
        expect(r.abilities.length).toBeGreaterThan(2);
    });

    it('a table with no status column is NOT told it can filter', () => {
        //  His sales table, exactly: three columns, none a status. The array
        //  methods are present — that was the whole defect — and the claim
        //  must still not appear.
        const src = app({ statusColumn: false });
        expect(src).toContain('.filter(');
        expect(src).toContain('.sort(');
        expect(claimed(src)).not.toContain('filtering by status');
    });

    it('and one WITH a status column is', () => {
        //  The positive case. A guard that refuses every filter claim would
        //  hide a capability that is really there.
        expect(claimed(app({ statusColumn: true }))).toContain('filtering by status');
    });

    it('accepts the plural filter state used by the generated records view', () => {
        const pluralState = app({ statusColumn: true }).replace('setFilter(', 'setFilters(');
        expect(claimed(pluralState)).toContain('filtering by status');
    });

    it('search and sort are claimed from their own controls, not from array methods', () => {
        const both = claimed(app({ statusColumn: true }));
        expect(both).toContain('instant search');
        expect(both).toContain('sorting the rows');
        //  Remove the controls, keep the array methods: both claims must go.
        const bare = app({ search: false, sort: false, statusColumn: true });
        expect(bare).toContain('.sort(');
        expect(claimed(bare)).not.toContain('instant search');
        expect(claimed(bare)).not.toContain('sorting the rows');
    });

    it('what is not claimed is reported as unmeasured, never dropped', () => {
        //  Silence is the one outcome that is never acceptable: he has to be
        //  able to see that the filter was NOT proven, not merely not read it.
        const r = measuredAppAbilities('records', false, app({ statusColumn: false }));
        expect(r.unmeasured.join(' | ')).toContain('filtering by status');
    });
});
