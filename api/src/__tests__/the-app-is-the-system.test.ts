/**
 * HE ASKED FOR A NURSERY AND GOT A FORM FOR «RECORDS».
 *
 * After the tables were finally read from his own sentence, his build showed:
 *
 *     إضافة سجلّ      ← العنوان * · التفاصيل · قيمة · التاريخ · الحالة
 *     إدارة النظام    ← النباتات | الموردون
 *
 * Two collections, and the one on top means nothing. The generic schema is the
 * FALLBACK the blueprint uses when it cannot tell what is being managed — and
 * by the time the interface is generated the real tables are already known,
 * because the server was built from them a minute earlier.
 *
 * So the first table becomes the application: «إضافة نبتة» with الاسم، السعر،
 * الكمية، الوصف, and the administration screens carry the REST.
 *
 * Proven live end to end (verify_the_app_is_the_system.ts).
 */
import fs from 'fs';
import path from 'path';
import { apiFor, blueprintFromEntity, oneOf } from '../core/design/entity-app';
import { blueprintFor } from '../core/design/app-blueprints';
import { namedEntities } from '../core/design/named-entities';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');
const HIS_WORDS = 'ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات مع صور نباتات وثيم اخضر جميل للنظام';

describe('the first table becomes the application', () => {
    const base = () => blueprintFor('generic', HIS_WORDS, true);
    const plants = () => namedEntities(HIS_WORDS)[0];

    it('«إضافة سجلّ» becomes «إضافة نبتة»', () => {
        const bp = blueprintFromEntity(base(), plants(), true);
        expect(bp.entityOne).toBe('نبتة');
        expect(bp.entityMany).toBe('النباتات');
        expect(bp.title).toBe('النباتات');
        expect(bp.emptyHint).toContain('أضف أول نبتة');
    });

    it('and its fields are the table’s own columns, in the right shape', () => {
        const bp = blueprintFromEntity(base(), plants(), true);
        expect(bp.fields.map(f => f.key)).toEqual(['name', 'price', 'quantity', 'description']);
        expect(bp.fields.map(f => f.label)).toEqual(['الاسم', 'السعر', 'الكمية', 'الوصف']);
        // A price is a number, a description is a paragraph, a name is required
        // AND the one that titles the row wherever it is listed.
        expect(bp.fields.find(f => f.key === 'price')!.type).toBe('number');
        expect(bp.fields.find(f => f.key === 'description')!.type).toBe('textarea');
        expect(bp.fields.find(f => f.key === 'name')).toMatchObject({ required: true, primary: true });
    });

    it('a phone is a phone and an email is an email', () => {
        const sup = namedEntities(HIS_WORDS)[1];
        const bp = blueprintFromEntity(base(), sup, true);
        expect(bp.fields.find(f => f.key === 'phone')!.type).toBe('tel');
        expect(bp.fields.find(f => f.key === 'email')!.type).toBe('email');
    });

    it('the totals are computed from columns that EXIST — never invented', () => {
        const bp = blueprintFromEntity(base(), plants(), true);
        expect(bp.metrics[0]).toEqual({ label: 'كل النباتات', kind: 'count' });
        expect(bp.metrics.some(m => m.kind === 'sum' && m.field === 'price')).toBe(true);
        // A table with no money column gets no money total.
        const sup = blueprintFromEntity(base(), namedEntities(HIS_WORDS)[1], true);
        expect(sup.metrics.every(m => m.kind === 'count' || m.field !== 'price')).toBe(true);
    });

    it('a link column is NOT a form field — it is chosen on the tables screen', () => {
        const withFk = { key: 'invoices', ar: 'الفواتير', en: 'invoices',
            belongsTo: { entity: 'plants', key: 'plant_id' },
            fields: [{ key: 'plant_id', type: 'INT' as const }, { key: 'reference', type: 'TEXT' as const, required: true, ar: 'المرجع', en: 'ref' }] };
        const bp = blueprintFromEntity(base(), withFk, true);
        expect(bp.fields.map(f => f.key)).toEqual(['reference']);
        expect(bp.relation).toBeUndefined();
    });

    it('and a table with nothing but a link keeps the fallback rather than shipping an empty form', () => {
        const empty = { key: 'links', ar: 'روابط', en: 'links', fields: [{ key: 'plant_id', type: 'INT' as const }] };
        const b = base();
        expect(blueprintFromEntity(b, empty, true)).toBe(b);
    });

    it('the singular is a word, not a guess', () => {
        expect(oneOf({ key: 'suppliers', ar: 'الموردون', en: 'suppliers', fields: [] }, true)).toBe('مورّد');
        expect(oneOf({ key: 'properties', ar: 'العقارات', en: 'properties', fields: [] }, false)).toBe('property');
        // Nothing in the table: the plural, which is awkward and never wrong.
        expect(oneOf({ key: 'widgets', ar: 'الأدوات', en: 'widgets', fields: [] }, true)).toBe('الأدوات');
    });

    it('and the app talks to that table’s own address', () => {
        expect(apiFor('http://localhost:4100/api/items', 'plants')).toBe('http://localhost:4100/api/plants');
        expect(apiFor('', 'plants')).toBe('');
    });
});

describe('and the builder wires it without showing anything twice', () => {
    const R = () => read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

    it('only the fallback kind is replaced — a map app still manages a map', () => {
        const r = R();
        expect(r).toMatch(/appBp\.kind === 'generic' && appBp\.engine === 'records'/);
        expect(r).toMatch(/const derived = blueprintFromEntity\(appBp, lead, isAr\)/);
    });

    it('the app takes the first table and the admin screens take the rest', () => {
        const r = R();
        expect(r).toMatch(/adminModel = tableModel\.slice\(1\);/);
        expect(r).toMatch(/appApi = apiFor\(apiLink, lead\.key\) \|\| apiLink/);
        expect(r).toMatch(/model: adminModel,/);
    });
});

describe('the app can actually read and write that table', () => {
    const T = () => read('modules', 'tools', 'definitions', 'react-app-templates.ts');

    it('a generated table answers «row» where the catalogue answers «item»', () => {
        // Knowing only one meant the server's real id was never adopted, and
        // the next edit went to /api/plants/<local-uid> and 404'd.
        const t = T();
        expect(t).toMatch(/return \{ ok: true, item: d\.item \|\| d\.row \|\| row \};/);
        expect(t).toMatch(/return \{ ok: true, item: d\.item \|\| d\.row \|\| null \};/);
    });

    it('and it recognises its own server on a domain, not just localhost', () => {
        // /api/health names the primary collection in `resource` and every
        // other table in `tables`. Without the second half an app built to
        // manage «plants» kept the dev address the moment it was deployed.
        const t = T();
        expect(t).toMatch(/d\.tables && Object\.prototype\.hasOwnProperty\.call\(d\.tables, resource\)/);
        expect(t).toMatch(/if \(mine\) return '\/api\/' \+ tail;/);
    });

    it('and nothing in the generated store carries a backtick', () => {
        // A backtick inside this template literal ends it, and the export stops
        // being a function. That bug has shipped twice.
        const t = T();
        const at = t.indexOf('export function fileAppStoreJs');
        expect(at).toBeGreaterThan(0);
        expect(t.slice(at, t.indexOf('export function', at + 30))).not.toContain('``');
    });
});
