/**
 * HE ASKED FOR SIX KINDS OF HONEY WITH PRICES. JOE BUILT THE SHELVES EMPTY.
 *
 * Watched live by the owner, on his own screen. His request, verbatim:
 *
 *     «اعمل لي متجراً إلكترونياً لبيع العسل الطبيعي اسمه «شهد» … وصفحة منتجات
 *       فيها ستة أنواع عسل مع أسعارها … ولا تقبل سعراً صفراً أو سالباً.»
 *
 * The build was real, the four pages he named were there, and the preview
 * showed:
 *
 *     عدد المنتجات  0        قيمة المعروض  0
 *     متوسط السعر   —        في السلة      0
 *
 * There is no product list in the generated `content.js` at all. The engine
 * reads its rows from browser storage, empty on a first visit, so the shop was
 * a data-entry form waiting for him to type six honeys in himself.
 *
 * ⛔ THE CLASS IS THE FOURTH LAW IN ITS PLAINEST FORM: he said what to put on
 * the shelves and Joe built the shelves. The count was in his sentence, the
 * requirement that they carry prices was in his sentence, and the rule that no
 * price may be zero or negative was in his sentence. None of it reached the
 * thing he was shown.
 *
 * The negatives here matter more than the positives: a catalogue layer that
 * accepts anything would fill his shop with invented goods, which is worse
 * than an empty shelf — an empty shelf is at least honest.
 */

import {
    countHeAskedFor,
    minimumHeStated,
    refuseRow,
    parseRows,
    authorCatalogue,
    cataloguePrompt,
    type CatalogueSpec,
} from '../core/design/authored-catalogue';

const REQUEST = 'اعمل لي متجراً إلكترونياً لبيع العسل الطبيعي اسمه «شهد»، فيه صفحة رئيسية وصفحة منتجات فيها ستة أنواع عسل مع أسعارها، وصفحة عن المزرعة، وصفحة تواصل فيها نموذج يعمل، وسلة شراء تحسب الإجمالي وتحفظ الطلب. التصميم دافئ وفاخر، ولا تقبل سعراً صفراً أو سالباً.';

/** The engine's real field schema, copied from a generated store. */
const FIELDS = [
    { key: 'name', label: 'اسم المنتج', type: 'text', required: true },
    { key: 'price', label: 'السعر', type: 'number', required: true, min: 0 },
    { key: 'category', label: 'التصنيف', type: 'text' },
    { key: 'description', label: 'الوصف', type: 'textarea' },
    { key: 'image', label: 'رابط الصورة', type: 'text' },
    { key: 'stock', label: 'المخزون', type: 'number' },
];

const spec = (over: Partial<CatalogueSpec> = {}): CatalogueSpec => ({
    request: REQUEST,
    brand: 'شهد',
    isArabic: true,
    entityOne: 'منتج',
    fields: FIELDS,
    wanted: 6,
    minNumeric: 1,
    ...over,
});

const honey = (name: string, price: number) => ({
    name, price, category: 'عسل', description: 'من مناحلنا', image: '', stock: 20,
});

describe('the count and the constraints are read from his sentence', () => {
    it('⛔ POSITIVE — «ستة أنواع» is six', () => {
        expect(countHeAskedFor(REQUEST)).toBe(6);
    });

    it('POSITIVE — and digits count as well as words', () => {
        expect(countHeAskedFor('اعمل متجراً فيه 8 منتجات')).toBe(8);
        expect(countHeAskedFor('a store with 5 products')).toBe(5);
    });

    it('NEGATIVE — a sentence with no count says so, it does not guess', () => {
        //  Inventing «about six» would be the catalogue answer this whole
        //  session exists to delete.
        expect(countHeAskedFor('اعمل لي متجراً لبيع العسل')).toBeUndefined();
        expect(countHeAskedFor('')).toBeUndefined();
    });

    it('NEGATIVE — a number that counts something else is not a product count', () => {
        expect(countHeAskedFor('اعمل متجراً وافتحه على المنفذ 3000')).toBeUndefined();
    });

    it('⛔ POSITIVE — «ولا تقبل سعراً صفراً أو سالباً» becomes a real floor', () => {
        expect(minimumHeStated(REQUEST)).toBe(1);
    });

    it('NEGATIVE — and a sentence that states no rule imposes none', () => {
        expect(minimumHeStated('اعمل لي متجراً لبيع العسل')).toBeUndefined();
    });
});

describe('a row goes on the shelf only if the store can really hold it', () => {
    it('POSITIVE — a complete, priced row is accepted', () => {
        expect(refuseRow(honey('عسل سدر جبلي', 180), spec())).toBe('');
    });

    it('⛔ NEGATIVE — a zero price is refused BY HIS OWN RULE', () => {
        const why = refuseRow(honey('عسل سدر', 0), spec());
        expect({ refused: !!why, names: why.includes('السعر') }).toEqual({ refused: true, names: true });
    });

    it('NEGATIVE — and a negative price too', () => {
        expect(!!refuseRow(honey('عسل سمر', -5), spec())).toBe(true);
    });

    it('NEGATIVE — a missing required field is refused', () => {
        expect(!!refuseRow({ ...honey('', 100) }, spec())).toBe(true);
        expect(!!refuseRow({ name: 'عسل', category: 'عسل' }, spec())).toBe(true);
    });

    it('NEGATIVE — a price that is not a number is refused', () => {
        expect(!!refuseRow({ ...honey('عسل', 0), price: 'غالي' }, spec())).toBe(true);
    });

    it('NEGATIVE — a row carrying fields the store does not have is refused', () => {
        //  Otherwise the seed writes keys the engine never reads, and the shop
        //  silently drops half of what he was shown.
        expect(refuseRow({ ...honey('عسل', 120), colour: 'ذهبي' }, spec()))
            .toContain('does not have');
    });

    it('NEGATIVE — with no rule of his, the field\'s own floor still applies', () => {
        //  min: 0 on the price field means a negative price is refused even
        //  when his sentence said nothing about prices.
        const noRule = spec({ minNumeric: undefined });
        expect(refuseRow(honey('عسل', 0), noRule)).toBe('');
        expect(!!refuseRow(honey('عسل', -1), noRule)).toBe(true);
    });
});

describe('the shelf is filled from his request, or it stays empty', () => {
    const six = [
        honey('عسل سدر جبلي', 180), honey('عسل سمر', 140), honey('عسل أكاسيا', 160),
        honey('عسل زهور برية', 120), honey('عسل حبة البركة', 150), honey('عسل مانوكا', 320),
    ];

    it('⛔ POSITIVE — six real rows reach the shop', async () => {
        const r = await authorCatalogue(spec(), async () => JSON.stringify({ rows: six }));
        expect(r.rows.length).toBe(6);
        expect(r.rejected).toEqual([]);
        expect(r.rows[0].name).toBe('عسل سدر جبلي');
    });

    it('NEGATIVE — a bad row is dropped BY NAME and the rest still arrive', async () => {
        const r = await authorCatalogue(
            spec({ wanted: undefined }),
            async () => JSON.stringify({ rows: [...six.slice(0, 3), honey('عسل مجاني', 0)] }),
        );
        expect(r.rows.length).toBe(3);
        expect(r.rejected.map(x => x.row)).toEqual(['عسل مجاني']);
    });

    it('⛔ NEGATIVE — falling short of the count he named is REPORTED, not hidden', async () => {
        //  «حين تحدّد عدداً، العدد جزءٌ من النطاق». Four when he said six is a
        //  shortfall he must be told about.
        const r = await authorCatalogue(spec(), async () => JSON.stringify({ rows: six.slice(0, 4) }));
        expect(r.rows.length).toBe(4);
        expect(r.rejected.map(x => x.row)).toEqual(['*count']);
        expect(r.rejected[0].reason).toContain('asked for 6');
    });

    it('NEGATIVE — and more than he asked for is trimmed to his number', async () => {
        const r = await authorCatalogue(spec(), async () => JSON.stringify({ rows: [...six, honey('عسل زائد', 90)] }));
        expect(r.rows.length).toBe(6);
    });

    it('NEGATIVE — a repeated row is not a second product', async () => {
        const r = await authorCatalogue(
            spec({ wanted: undefined }),
            async () => JSON.stringify({ rows: [honey('عسل سدر', 180), honey('عسل سدر', 200)] }),
        );
        expect(r.rows.length).toBe(1);
        expect(r.rejected[0].reason).toContain('repeats');
    });

    it('NEGATIVE — a provider that is down leaves the shelf empty and says so', async () => {
        const r = await authorCatalogue(spec(), async () => { throw new Error('all providers unavailable'); });
        expect(r.rows).toEqual([]);
        expect(r.rejected[0].reason).toContain('could not be reached');
    });

    it('NEGATIVE — noise leaves the shelf empty rather than inventing a shop', async () => {
        const r = await authorCatalogue(spec(), async () => 'I cannot help with that.');
        expect(r.rows).toEqual([]);
        expect(parseRows('nothing here')).toEqual([]);
    });
});

describe('the brief carries his sentence and the store\'s real schema', () => {
    const p = cataloguePrompt(spec());

    it('POSITIVE — his request verbatim, his count, and his floor', () => {
        expect(p).toContain(REQUEST);
        expect(p).toContain('EXACTLY 6');
        expect(p).toContain('at least 1');
    });

    it('POSITIVE — and every field the engine really has', () => {
        for (const f of FIELDS) expect(p).toContain(f.key);
    });

    it('NEGATIVE — it never names a kind of shop to imitate', () => {
        for (const cage of ['restaurant', 'grocery', 'pharmacy', 'مطعم', 'صيدلية', 'بقالة']) {
            expect({ cage, present: p.toLowerCase().includes(cage) }).toEqual({ cage, present: false });
        }
    });
});

/**
 *  ⛔ AND THE SEED MUST ACTUALLY REACH THE SHOP.
 *
 *  A catalogue layer that writes perfect rows into a variable nobody reads is
 *  this session's most common defect wearing its best suit: a capability that
 *  exists and a reader that never asks. So the wiring is read from the source,
 *  end to end — generator → build options → content.js → the store engine.
 */
describe('the seed reaches the shelf, not just a variable', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
    const TOOL = read('modules/tools/definitions/ReactProjectTool.ts');
    const TPL = read('modules/tools/definitions/react-app-templates.ts');

    it('POSITIVE — the generator writes a catalogue and hands it to the build', () => {
        expect(TOOL).toContain('authorCatalogue');
        expect(TOOL).toMatch(/buildAppFiles\(runBp, \{\s*\n\s*seedRows,/);
    });

    it('POSITIVE — the build writes it into content.js', () => {
        expect(TPL).toMatch(/seedRows: \$\{JSON\.stringify\(o\.seedRows \|\| \[\]\)\}/);
    });

    it('⛔ POSITIVE — and the store engine really reads it', () => {
        //  The link that was missing: createStore took a key and nothing else,
        //  so the shop could only ever start empty.
        expect(TPL).toContain("createStore(content.storeKey + ':products', content.seedRows)");
        expect(TPL).toMatch(/export function createStore\(key, seed\)/);
    });

    it('NEGATIVE — the seed is written ONCE, only into empty storage', () => {
        //  Writing it on every read would resurrect products he deleted, and
        //  his own edits must outrank anything the build guessed.
        const fn = TPL.slice(TPL.indexOf('export function createStore'), TPL.indexOf('export function createStore') + 900);
        expect(fn).toMatch(/if \(raw\) return JSON\.parse\(raw\);/);
        expect(fn).toMatch(/if \(Array\.isArray\(seed\) && seed\.length\)/);
    });

    it('NEGATIVE — and the catalogue stands down with the other authors', () => {
        //  It spends the same rationed fuel as the section and copy authors;
        //  guarding two of three is the «one layer, two generators» class.
        expect(TOOL).toMatch(/if \(!copyProvidersRationing && seedFields\.length/);
    });
});

/**
 *  ⛔ A ROW WITHOUT AN id IS A PRODUCT NOBODY CAN BUY.
 *
 *  Measured on the owner's screen, one build after the shelves were finally
 *  filled. Six honeys arrived, and the page reported:
 *
 *      console_errors  Each child in a list should have a unique "key" prop
 *      dead_controls   8 of 12 buttons do nothing: «السلة 0», «لوحة التاجر»,
 *                      «أضف إلى السلة»
 *
 *  Every row the engine creates itself gets `id: uid()`, and it keys its lists
 *  and its cart on `row.id`. The seed walked straight past the one line that
 *  gives a row its identity, so six products rendered as six duplicate keys
 *  and could not be added to a cart.
 *
 *  THE CLASS: a second writer for rows that the one writer's invariant never
 *  reached — the same shape as every «one layer, two generators» defect
 *  tonight, and it produced a shop that looked complete and could not be
 *  bought from.
 */
describe('a seeded row is a real row', () => {
    const six = [
        honey('عسل سدر', 180), honey('عسل سمر', 140), honey('عسل أكاسيا', 160),
        honey('عسل زهور', 120), honey('عسل بركة', 150), honey('عسل مانوكا', 320),
    ];

    it('⛔ POSITIVE — every seeded row carries an id', async () => {
        const r = await authorCatalogue(spec(), async () => JSON.stringify({ rows: six }));
        expect(r.rows.every(x => typeof x.id === 'string' && x.id.length > 0)).toBe(true);
    });

    it('⛔ POSITIVE — and the ids are unique, which is the whole point', async () => {
        const r = await authorCatalogue(spec(), async () => JSON.stringify({ rows: six }));
        expect(new Set(r.rows.map(x => x.id)).size).toBe(r.rows.length);
    });

    it('NEGATIVE — the id is stable, not a clock reading', async () => {
        //  The seed is written once into storage; an id that changed between a
        //  build and its audit would be a different bug wearing this one's face.
        const a = await authorCatalogue(spec(), async () => JSON.stringify({ rows: six }));
        const b = await authorCatalogue(spec(), async () => JSON.stringify({ rows: six }));
        expect(a.rows.map(x => x.id)).toEqual(b.rows.map(x => x.id));
    });

    it('NEGATIVE — an id the model sends is not treated as an unknown field', () => {
        //  Refusing the row for carrying `id` would empty the shelf again, for
        //  the one field the engine needs most.
        expect(refuseRow({ id: 'x', ...honey('عسل', 100) }, spec())).toBe('');
    });
});
