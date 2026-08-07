/**
 * HE ALREADY TOLD JOE THE TABLES.
 *
 *     «ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات
 *      مع صور نباتات وثيم اخضر جميل للنظام»
 *
 * What arrived on his screen was a generic «إضافة سجلّ» form — العنوان،
 * التفاصيل، قيمة، التاريخ، الحالة — with the subtitle «اً لمشتل نباتات:
 * النباتات والموردون والط». Two separate defects, both visible in one
 * screenshot, and neither of them about intelligence:
 *
 *   1. «مشتل» is not one of the six hand-written domains, and every provider
 *      was rate-limited that minute, so `designDataModel` returned nothing —
 *      although the three tables were written in the sentence, after a colon,
 *      separated by «و». Reading a list a human typed does not need a model;
 *   2. and the app's own name was the first forty characters of the request,
 *      cut mid-word, with the case ending of «نظاماً» still attached.
 *
 * Proven live from his exact sentence (verify_he_named_the_tables.ts).
 */
import { alreadyOwned, namedEntities } from '../core/design/named-entities';
import { designDataModel } from '../core/design/schema-designer';
import { subjectOf } from '../core/design/app-blueprints';

const HIS_WORDS = 'ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات مع صور نباتات وثيم اخضر جميل للنظام';

describe('the tables are read from the sentence, not guessed', () => {
    it('his exact words give plants and suppliers — and say why not orders', () => {
        const m = namedEntities(HIS_WORDS);
        expect(m.map(e => e.key)).toEqual(['plants', 'suppliers']);
        expect(m.map(e => e.ar)).toEqual(['النباتات', 'الموردون']);
        // Measured live: a generated `orders` table was shadowed by the base
        // server's own POST /api/orders and answered «item_required» to every
        // write. It is not regenerated — and the drop is announced, not hidden.
        expect(alreadyOwned(HIS_WORDS)).toEqual(['الطلبيات']);
    });

    it('and the waw that joins an Arabic list is a separator', () => {
        // `\b` is defined by `\w`, which holds no Arabic letter — the first
        // version used `\bو` and matched nothing at all.
        expect(namedEntities('ابنِ نظاماً لعيادة: الأطباء والمرضى والمواعيد').map(e => e.key))
            .toEqual(['doctors', 'patients', 'appointments']);
        expect(namedEntities('نظام مدرسة يحتوي على الطلاب والمعلمين والدورات').map(e => e.key))
            .toEqual(['students', 'teachers', 'courses']);
        // `products` is one of the names the generator already owns, so it is
        // refused here exactly as the constrained designer refuses it.
        expect(namedEntities('build a system with suppliers, products and invoices').map(e => e.key))
            .toEqual(['suppliers', 'invoices']);
    });

    it('the design wishes after the list are not tables', () => {
        // «… والطلبيات مع صور نباتات وثيم اخضر جميل» — a table called «ثيم»
        // would be generated with real CRUD and a real screen.
        expect(namedEntities(HIS_WORDS).map(e => e.key)).not.toContain('theme');
        expect(namedEntities(HIS_WORDS).length).toBe(2);
    });

    it('and one recognised word is a coincidence, not a list', () => {
        expect(namedEntities('ابنِ نظاماً للمخزون: المنتجات فقط')).toEqual([]);
        expect(namedEntities('ابن لي متجراً بسيطاً للقهوة')).toEqual([]);
        expect(namedEntities('ما رأيك بالبن البرازيلي؟')).toEqual([]);
        expect(namedEntities('')).toEqual([]);
    });

    it('every table it reads is a safe SQL identifier with real columns', () => {
        for (const q of [HIS_WORDS, 'نظام: العملاء والفواتير والمدفوعات', 'system with drivers and shipments']) {
            for (const e of namedEntities(q)) {
                expect(e.key).toMatch(/^[a-z][a-z0-9_]*$/);
                expect(e.fields.length).toBeGreaterThan(1);
                for (const f of e.fields) expect(f.key).toMatch(/^[a-z][a-z0-9_]*$/);
                if (e.belongsTo) expect(e.fields.some(f => f.key === e.belongsTo!.key)).toBe(true);
            }
        }
    });

    it('a transaction points at the thing it is about, and cannot dangle', () => {
        const m = namedEntities('نظام: النباتات والموردون والفواتير');
        const inv = m.find(e => e.key === 'invoices')!;
        expect(inv.belongsTo).toEqual({ entity: 'plants', key: 'plant_id' });
        expect(inv.fields.some(f => f.key === 'plant_id')).toBe(true);
    });

    it('and the columns fit what the table is FOR', () => {
        const m = namedEntities(HIS_WORDS);
        // A supplier needs a phone; a plant needs a price; an order needs a status.
        expect(m.find(e => e.key === 'suppliers')!.fields.map(f => f.key)).toContain('phone');
        expect(m.find(e => e.key === 'plants')!.fields.map(f => f.key)).toContain('price');
        expect(namedEntities('نظام: النباتات والفواتير').find(e => e.key === 'invoices')!
            .fields.map(f => f.key)).toContain('status');
    });
});

describe('the designer reads him before it asks anyone', () => {
    it('no domain, no network, no model — and still real tables', async () => {
        const notes: string[] = [];
        // No provider is reachable from a unit test; that is the point.
        const m = await designDataModel(HIS_WORDS, { onNote: n => notes.push(n), timeoutMs: 1 });
        expect(m.map(e => e.key)).toEqual(['plants', 'suppliers']);
        expect(notes.join(' ')).toMatch(/read from the request itself/);
    });

    it('and a known domain still wins, because it is hand-checked', async () => {
        const m = await designDataModel('ابنِ نظاماً لعيادة أسنان: أطباء ومرضى ومواعيد', { timeoutMs: 1 });
        expect(m.map(e => e.key)).toEqual(['doctors', 'patients', 'appointments']);
    });
});

describe('the app is named, not sliced', () => {
    it('his subtitle was «اً لمشتل نباتات: النباتات والموردون والط» — now it is a name', () => {
        expect(subjectOf(HIS_WORDS)).toBe('مشتل نباتات');
    });

    it('the case ending of «نظاماً» does not survive on its own', () => {
        expect(subjectOf(HIS_WORDS).startsWith('اً')).toBe(false);
        expect(subjectOf('أنشئ موقعاً لشركة الشحن')).not.toMatch(/^اً|^ًا/);
    });

    it('and a long request is cut at a space, never through a word', () => {
        const s = subjectOf('أنشئ تطبيقاً لإدارة مخزون شركة الأدوية الكبرى في المنطقة الشرقية بالكامل');
        expect(s.length).toBeLessThanOrEqual(40);
        expect(s).not.toMatch(/\s$/);
        // The last word is whole — it appears in the request as written.
        expect('أنشئ تطبيقاً لإدارة مخزون شركة الأدوية الكبرى في المنطقة الشرقية بالكامل')
            .toContain(s.split(' ').pop()!);
    });

    it('and «ابن لي متجراً» loses the «لي», which \\b could never match', () => {
        expect(subjectOf('ابن لي متجراً بسيطاً للقهوة')).not.toMatch(/(^|\s)لي(\s|$)/);
    });
});
