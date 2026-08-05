/**
 * TWO TABLES, AND A LINE BETWEEN THEM THAT CANNOT DANGLE.
 *
 * «علاقات بين أكثر من جدول (طبيب ← مواعيده)».
 *
 * Every system Joe built owned exactly ONE table, so the doctor's name was
 * retyped on every appointment: misspelt on the third, unsearchable by the
 * fifth, impossible to rename at all. This is the gate on the fix — the
 * blueprint declares a parent, the schema carries the link, the generated
 * server refuses a link that points at nothing, and the interface picks the
 * parent from a list instead of asking anyone to type it again.
 *
 * The live half (a real server, real HTTP, a real join) is proved by
 * src/tests/manual/verify_relations.ts; this keeps the wiring from rotting.
 */
import { blueprintFor, detectAppKind, type AppKind } from '../core/design/app-blueprints';
import { apiColumnsForRequest, apiRelationForRequest, CATALOGUE_COLUMNS } from '../modules/tools/definitions/ApiProjectTool';
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';

const bpFor = (req: string) => {
    const kind = detectAppKind(req);
    expect(kind).toBeTruthy();
    return blueprintFor(kind as AppKind, req, true);
};

describe('a system may own more than one table', () => {
    it('a clinic booking system links every appointment to a DOCTOR', () => {
        const bp = bpFor('نظام حجز مواعيد لعيادة أسنان');
        expect(bp.relation).toBeTruthy();
        expect(bp.relation!.resource).toBe('providers');
        expect(bp.relation!.key).toBe('provider_id');
        // The user's own words for the parent, not a generic «record».
        expect(bp.relation!.one).toBe('طبيب');
        expect(bp.relation!.many).toBe('الأطباء');
    });

    it('…and a salon books the same shape with its own word for it', () => {
        const bp = bpFor('نظام حجوزات لصالون تجميل');
        expect(bp.relation!.resource).toBe('providers');
        expect(bp.relation!.one).toBe('مقدّم الخدمة');
    });

    it('an LMS links an enrolment to a course, a CRM to a company, stock to a supplier', () => {
        expect(bpFor('منصة تعليمية لإدارة الطلاب والدرجات').relation!.resource).toBe('courses');
        expect(bpFor('نظام إدارة علاقات العملاء').relation!.resource).toBe('companies');
        expect(bpFor('نظام إدارة المخزون').relation!.resource).toBe('suppliers');
    });

    it('the retyped text field is REPLACED by the link, never duplicated', () => {
        // A `course` string beside a `course_id` link is two truths about the
        // same thing, and they drift apart on the first rename.
        const lms = bpFor('منصة تعليمية لإدارة الطلاب والدرجات');
        expect(lms.fields.map(f => f.key)).not.toContain('course');
        const crm = bpFor('نظام إدارة علاقات العملاء');
        expect(crm.fields.map(f => f.key)).not.toContain('company');
        const inv = bpFor('نظام إدارة المخزون');
        expect(inv.fields.map(f => f.key)).not.toContain('supplier');
    });

    it('the parent label field really exists on the parent', () => {
        for (const req of ['نظام حجز مواعيد لعيادة', 'منصة تعليمية للطلاب', 'نظام إدارة علاقات العملاء', 'نظام إدارة المخزون']) {
            const bp = bpFor(req);
            const keys = bp.relation!.fields.map(f => f.key);
            expect(`${req}: ${keys.includes(bp.relation!.labelKey)}`).toBe(`${req}: true`);
        }
    });

    it('and an app with nothing to belong to declares no parent at all', () => {
        expect(bpFor('تطبيق ملاحظات').relation).toBeUndefined();
        expect(bpFor('تطبيق لتتبّع المصاريف').relation).toBeUndefined();
        expect(apiRelationForRequest('موقع لمحل عطور فاخر')).toBeNull();
        expect(apiRelationForRequest('')).toBeNull();
    });
});

describe('the schema carries the link', () => {
    const REQ = 'نظام حجز مواعيد لعيادة أسنان';

    it('the child table gains an INT column named after the relation', () => {
        const cols = apiColumnsForRequest(REQ);
        const fk = cols.find(c => c.key === 'provider_id');
        expect(fk).toBeTruthy();
        expect(fk!.type).toBe('INT');
        // Optional on purpose: a walk-in appointment with no doctor yet is a
        // real row, not an error.
        expect(fk!.required).toBe(false);
    });

    it('the parent table has its own real columns', () => {
        const rel = apiRelationForRequest(REQ)!;
        expect(rel.resource).toBe('providers');
        expect(rel.labelKey).toBe('name');
        expect(rel.columns.map(c => c.key)).toEqual(['name', 'specialty', 'phone']);
        expect(rel.columns.find(c => c.key === 'name')!.required).toBe(true);
    });

    it('every identifier the generator emits is SQL-safe', () => {
        const rel = apiRelationForRequest(REQ)!;
        expect(rel.resource).toMatch(/^[a-zA-Z0-9_]{1,40}$/);
        expect(rel.key).toMatch(/^[a-zA-Z0-9_]{1,40}$/);
        expect(rel.labelKey).toMatch(/^[a-zA-Z0-9_]{1,40}$/);
        for (const c of rel.columns) expect(c.key).toMatch(/^[a-zA-Z0-9_]{1,40}$/);
    });

    it('a presentation site is untouched — no parent, no extra column', () => {
        expect(apiColumnsForRequest('موقع لمحل عطور فاخر')).toBe(CATALOGUE_COLUMNS);
    });
});

describe('the interface reaches the second table', () => {
    const files = (req: string) => {
        const kind = detectAppKind(req) as AppKind;
        return buildAppFiles(
            blueprintFor(kind, req, true),
            { isArabic: true, brand: 'Joe', storeKey: 'k', api: 'http://localhost:4100/api/bookings' } as any,
            'app',
        );
    };

    it('content.js describes the parent so the app can render a picker', () => {
        const content = files('نظام حجز مواعيد لعيادة أسنان')['src/content.js'];
        expect(content).toContain("resource: 'providers'");
        expect(content).toContain("key: 'provider_id'");
        expect(content).toContain("labelKey: 'name'");
    });

    it('the records engine renders the picker, the filter and the parent panel', () => {
        const app = files('نظام حجز مواعيد لعيادة أسنان')['src/components/RecordsApp.jsx'];
        expect(app).toContain('const rel = content.relation');
        expect(app).toContain('addParent');            // create a doctor without leaving
        expect(app).toContain('parentFilter');         // «كل مواعيد هذا الطبيب»
        expect(app).toContain('parent_label');         // …and read the name the server sent
        expect(app).toContain('apiListOn');
    });

    it('an app with no parent still renders — the picker is simply absent', () => {
        const app = files('تطبيق ملاحظات')['src/components/RecordsApp.jsx'];
        const content = files('تطبيق ملاحظات')['src/content.js'];
        expect(content).toContain('relation: null');
        // The same component serves both: the guard is `rel ? … : null`.
        expect(app).toContain('const rel = content.relation');
    });

    it('and an edit now reaches the server instead of only this browser', () => {
        const app = files('تطبيق ملاحظات')['src/components/RecordsApp.jsx'];
        expect(app).toContain('apiUpdate(content.api, editing, patch)');
    });
});
