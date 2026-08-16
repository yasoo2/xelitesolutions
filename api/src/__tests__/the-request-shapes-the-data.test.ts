/**
 * «ابنِ تطبيق مصاريف بفئات: طعام، مواصلات، فواتير» — the categories are the
 * request's OWN, and the engine used to answer with its five stock ones
 * regardless. The fishing law, applied to the data shape: declared options
 * replace the stock ones; silence keeps the stock blueprint byte-for-byte.
 *
 * And what the rows say is now DRAWN: a dependency-free donut of the real
 * rows, grouped by the app's own grouping field, plus the topGroup metric —
 * both fed by the same groupTotals, so the chart and the number cannot
 * disagree.
 */
import fs from 'fs';
import path from 'path';
import { readDeclaredOptions, blueprintFor } from '../core/design/app-blueprints';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('the declared categories are read from the request', () => {
    it('Arabic, colon-separated', () => {
        expect(readDeclaredOptions('ابنِ تطبيق مصاريف بفئات: طعام، مواصلات، فواتير، ترفيه'))
            .toEqual(['طعام', 'مواصلات', 'فواتير', 'ترفيه']);
    });
    it('Arabic with «و» as the separator', () => {
        expect(readDeclaredOptions('تطبيق مخزون بتصنيفات: مواد بناء وأدوات كهربائية وسباكة'))
            .toEqual(['مواد بناء', 'أدوات كهربائية', 'سباكة']);
    });
    it('English', () => {
        expect(readDeclaredOptions('an expense app with categories: food, transport, bills'))
            .toEqual(['food', 'transport', 'bills']);
    });
    it('«إلخ» is not a category, and duplicates collapse', () => {
        expect(readDeclaredOptions('بفئات: طعام، طعام، سفر، إلخ')).toEqual(['طعام', 'سفر']);
    });
    it('THE FISHING TEST: silence and junk return null', () => {
        expect(readDeclaredOptions('ابنِ تطبيق مصاريف يومية')).toBeNull();
        expect(readDeclaredOptions('بفئات:')).toBeNull();
        expect(readDeclaredOptions('')).toBeNull();
        // One item is a word, not a list.
        expect(readDeclaredOptions('بفئات: طعام')).toBeNull();
    });
});

describe('the blueprint obeys the declaration', () => {
    it('declared categories replace the stock ones on the expenses select', () => {
        const bp = blueprintFor('expenses', 'تطبيق مصاريف بفئات: طعام، مواصلات، فواتير، ترفيه', true);
        const cat = bp.fields.find(f => f.key === 'category')!;
        expect(cat.options).toEqual(['طعام', 'مواصلات', 'فواتير', 'ترفيه']);
        expect(bp.statusField).toBe('category');
    });
    it('silence keeps the stock five exactly', () => {
        const bp = blueprintFor('expenses', 'تطبيق مصاريف يومية', true);
        expect(bp.fields.find(f => f.key === 'category')!.options)
            .toEqual(['طعام', 'مواصلات', 'فواتير', 'تسوّق', 'أخرى']);
    });
    it('a text category field becomes a real select when options are declared', () => {
        const bp = blueprintFor('store', 'متجر بفئات: قهوة، أدوات، هدايا', true);
        const cat = bp.fields.find(f => f.key === 'category')!;
        expect(cat.type).toBe('select');
        expect(cat.options).toEqual(['قهوة', 'أدوات', 'هدايا']);
    });
    it('expenses carries the topGroup metric', () => {
        const bp = blueprintFor('expenses', 'تطبيق مصاريف', true);
        expect(bp.metrics.some(m => m.kind === 'topGroup' && m.field === 'category' && m.field2 === 'amount')).toBe(true);
    });
});

describe('the chart is real and shares its numbers with the metric', () => {
    const T = () => read('modules', 'tools', 'definitions', 'react-app-templates.ts');
    it('groupTotals lives in the generated store and topGroup computes from it', () => {
        const t = T();
        expect(t).toMatch(/export function groupTotals\(rows, groupField, valueField\)/);
        expect(t).toMatch(/case 'topGroup':/);
    });
    it('the records app draws a donut from its own rows, gated on the grouping field', () => {
        const t = T();
        expect(t).toMatch(/if \(!content\.statusField\) return null;/);
        expect(t).toMatch(/groupTotals\(rows, content\.statusField, money\)/);
        expect(t).toMatch(/conic-gradient/);
        expect(t).toMatch(/chart-legend/);
        // Fewer than two groups is a number, not a chart.
        expect(t).toMatch(/groups\.length < 2\) return null/);
    });
    it('the chart styles ride in the app css', () => {
        expect(T()).toMatch(/\.donut\{position:relative/);
        expect(T()).toMatch(/\.chart-legend li\{display:flex/);
    });
});
