/**
 * THE BUILDERS AND THE DELIVERY GATE READ ONE LIST (round 22, findings R1–R4
 * and R6 of the second review of round 21; R5 and R7 have their own files).
 *
 * Every builder of a request's tables (designDataModel for api_project,
 * api_project's own selection, react_project's fallback) and the delivery gate
 * (requestedRecords) read his listed records through one function,
 * named-entities.listedRecords — the same items, the same keys, the same
 * floor — so a request in Arabic or English, formal or informal, is built and
 * checked as the same set of records, and no list is dropped on one side only.
 *
 * Every case below was measured on 3c8302e2 (the probe and its before/after
 * output live in eval/proof/r22/reading/) and failed there.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listedRecords, namedEntities, nounKeyOfItem } from '../core/design/named-entities';
import { inferModel, keyForPhrase } from '../core/design/entity-inference';
import { designDataModel, readDataModel } from '../core/design/schema-designer';
import { listRegion } from '../core/design/request-lists';
import { collectServerEvidence, judgeRequestCoverage, requestedRecords } from '../core/quality/request-coverage';
import { selectApiPrimary } from '../modules/tools/definitions/ApiProjectTool';

const keys = (entities: Array<{ key: string }>) => entities.map(e => e.key);
const gate = (request: string, backendRequested = true) => requestedRecords(request, { backendRequested });

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-reading-'));
    roots.push(dir);
    for (const [rel, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), body);
    }
    return dir;
}
const server = (paths: string[]) => "const app = require('express')();\n"
    + paths.map(p => `app.get('${p}', (req, res) => res.json([]));\n`).join('');
const judged = async (request: string, paths: string[]) => {
    const records = gate(request);
    const report = judgeRequestCoverage({ records, evidence: await collectServerEvidence([tree({ 'server.js': server(paths) })], records.entities), backendRequested: true });
    return { records, report };
};

/* ─────────────────────────────── R1 ─────────────────────────────── */

describe('R1 — a record about another record is its own table, never its possessor\'s', () => {
    const SALARIES = 'ابن باك اند لشركة: الأقسام، الموظفين، رواتب الموظفين';

    it('«رواتب الموظفين» is a table of its own, linked to the employees, in every reader', () => {
        const read = namedEntities(SALARIES);
        const salaries = read.find(e => e.ar === 'رواتب الموظفين');
        expect(salaries).toBeDefined();
        expect(salaries!.key).not.toBe('employees');
        expect(salaries!.belongsTo?.entity).toBe('employees');
        expect(keys(read)).toEqual(expect.arrayContaining(['categories', 'employees', salaries!.key]));
        expect(nounKeyOfItem('رواتب الموظفين')).toBe('');
        expect(keyForPhrase('رواتب الموظفين')).toBe(salaries!.key);
        expect(keys(inferModel(SALARIES).entities)).toContain(salaries!.key);
        expect(keys(gate(SALARIES).entities)).toContain(salaries!.key);
    });

    it('…so a server of employees does not deliver their salaries', async () => {
        const { records, report } = await judged(SALARIES, ['/api/categories', '/api/employees']);
        const salaries = records.entities.find(e => e.item === 'رواتب الموظفين' || e.ar === 'رواتب الموظفين')!;
        expect(salaries).toBeDefined();
        expect(report.missing.map(r => r.key)).toContain(salaries.key);
    });

    it('English, and three-word items: fees, prescriptions and lab results are their own tables', () => {
        for (const [request, item, possessor] of [
            ['Gym backend: members, member fees, trainers', 'member fees', 'members'],
            ['Clinic backend: patients, patient prescriptions, doctors', 'patient prescriptions', 'patients'],
            ['School backend: students, student fees, teachers', 'student fees', 'students'],
            ['Clinic API with: patients, patient lab results, appointments', 'patient lab results', 'patients'],
        ] as const) {
            const key = keyForPhrase(item);
            expect(key).not.toBe(possessor);
            expect(keys(namedEntities(request))).toEqual(expect.arrayContaining([possessor, key]));
            expect(keys(gate(request).entities)).toEqual(expect.arrayContaining([possessor, key]));
            expect(namedEntities(request).find(e => e.key === key)?.belongsTo?.entity).toBe(possessor);
        }
        expect(keyForPhrase('member fees')).toBe('member_fees');
        expect(keyForPhrase('patient lab results')).toBe('patient_lab_results');
    });

    it('Arabic: prescriptions, notes, stock and test results of a known record are tables of their own', () => {
        const clinic = namedEntities('ابن نظام لعيادة: المرضى، وصفات المرضى، ملاحظات المرضى، المواعيد');
        expect(clinic.map(e => e.ar)).toEqual(expect.arrayContaining(['وصفات المرضى', 'ملاحظات المرضى']));
        expect(keys(clinic).filter(k => k === 'patients')).toHaveLength(1);
        const pharmacy = namedEntities('ابن نظام لصيدلية: الأدوية، مخزون الأدوية، الموردين');
        expect(pharmacy.map(e => e.ar)).toContain('مخزون الأدوية');
        const lab = namedEntities('ابن باك اند لمستشفى: المرضى، نتائج تحاليل المرضى، الأطباء');
        expect(lab.map(e => e.ar)).toContain('نتائج تحاليل المرضى');
    });

    it('«أصحاب الحيوانات» are the owners, not a second animals table', () => {
        const vet = namedEntities('ابن باك اند لعيادة بيطرية: الحيوانات الأليفة، أصحاب الحيوانات، التطعيمات، المواعيد');
        expect(keys(vet)).toEqual(['pets', 'owners', 'vaccinations', 'appointments']);
        expect(keys(namedEntities('Build a backend for a vet clinic: pets, pet owners, vaccinations, appointments')))
            .toEqual(['pets', 'owners', 'vaccinations', 'appointments']);
    });

    it('an English item is read by the head in front of its preposition', () => {
        const request = 'Build a clinic backend: patients, appointments with doctors, fees for patients, invoices';
        expect(nounKeyOfItem('appointments with doctors')).toBe('appointments');
        expect(keyForPhrase('fees for patients')).toBe(keyForPhrase('patient fees'));
        expect(keys(namedEntities(request))).toEqual(['patients', 'appointments', keyForPhrase('patient fees'), 'invoices']);
        expect(keys(gate(request).entities)).toEqual(keys(namedEntities(request)));
        // A phrase with a preposition inside it names no table of its own.
        expect(keys(namedEntities('a landing page with sections for about, services and contact'))).not.toContain('abouts');
    });

    it('a head that holds or works the records still names them, in both languages', () => {
        expect(keys(namedEntities('Build a clinic backend with: doctor profiles, appointment scheduling, patient history')))
            .toEqual(['doctors', 'appointments', 'patients']);
        expect(keys(namedEntities('Build a backend with: patient records, appointment list, invoices')))
            .toEqual(['patients', 'appointments', 'invoices']);
        expect(keys(namedEntities('نظام لعيادة فيه: سجل المرضى، وجدول المواعيد، والفواتير'))).toEqual(['patients', 'appointments', 'invoices']);
        expect(keys(namedEntities('ابن نظام لعيادة اسنان فيه: ملفات المرضى، جدول المواعيد، فواتير العلاج'))).toEqual(['patients', 'appointments', 'invoices']);
    });
});

/* ─────────────────────────────── R2 ─────────────────────────────── */

describe('R2 — one reading of his list for the builders and the gate', () => {
    const OFFICE_AR = 'ابن باك اند لمكتب: الموظفين، الإجازات، الحضور';
    const OFFICE_EN = 'Build a backend for an office: employees, leaves, attendance';
    const SHOP = 'Backend for my shop: products, product photos, customers, customer testimonials';
    const SHOP_AR = 'ابن باك اند لمتجري: المنتجات، صور المنتجات، العملاء، آراء العملاء';

    it('a list of one known noun and two unlisted ones is read, in Arabic as in English', () => {
        for (const request of [OFFICE_AR, OFFICE_EN]) {
            const built = keys(namedEntities(request));
            expect(built).toHaveLength(3);
            expect(built[0]).toBe('employees');
            expect(keys(gate(request).entities)).toEqual(built);
            expect(gate(request).unread).toEqual([]);
        }
    });

    it('the gate requires exactly what the builders read — the tables the system serves beside them', () => {
        for (const request of [SHOP, SHOP_AR]) {
            expect(keys(namedEntities(request))).toEqual(['customers']);
            expect(keys(gate(request).entities).sort()).toEqual(['customers', 'products']);
            // Content about a record is said («not verified»), never failed and never built.
            expect(gate(request).unread).toHaveLength(2);
        }
        expect(keys(namedEntities('backend for my bakery: cakes, orders, customers'))).toEqual(['cakes', 'customers']);
        // Two tables the system serves prove the list: the noun beside them is his too.
        expect(keys(namedEntities('Build a backend for my shop: products, orders, cakes'))).toEqual(['cakes']);
        expect(keys(gate('Build a backend for my shop: products, orders, cakes').entities).sort()).toEqual(['cakes', 'orders', 'products']);
        expect(keys(gate('backend for my bakery: cakes, orders, customers').entities).sort()).toEqual(['cakes', 'customers', 'orders']);
    });

    it('for a corpus in both languages, the gate\'s own records are the builders\' records', () => {
        const corpus = [
            OFFICE_AR, OFFICE_EN, SHOP, SHOP_AR,
            'HR backend with: employees, departments, employee salaries',
            'CRM backend with: leads, contacts, deals',
            'ابن باك اند لعيادة: قائمة المواعيد، الوصفات، التحاليل',
            'Build a backend for a car rental: cars, renters, rental contracts',
            'ابن باك اند لروضة اطفال: الاطفال، اولياء الامور، الحضور اليومي',
            'HR backend with: employee directory, payroll records, leave requests',
            'بدي برنامج لشركة توصيل: السواقين، الطلبات، مناطق التوصيل',
            'سوي لي باك اند لمحل جوالات: الاجهزه، الزبائن، الفواتير، الصيانه',
            'Build a REST API for a school with endpoints for students, classes, grades',
            'أنشئ واجهة برمجية لعيادة فيها نقاط وصول لـالمرضى والمواعيد والعلاجات',
        ];
        for (const request of corpus) {
            const reading = listedRecords(request, { backend: true });
            const served = reading.served.map(s => s.key);
            const own = keys(gate(request).entities).filter(key => !served.includes(key));
            expect({ request, own }).toEqual({ request, own: keys(namedEntities(request)) });
            expect(own.length + served.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('the gate reads a list for a server the way the builders do when one was built', () => {
        // A request that does not itself claim a server: the builders read it as
        // one (api_project built it), so the pipeline hands the gate that fact.
        const SYSTEM = 'ابن نظام لمكتب: الموظفين، الإجازات، الحضور';
        expect(keys(namedEntities(SYSTEM))).toHaveLength(3);
        expect(gate(SYSTEM, false).entities).toEqual([]);
        expect(keys(gate(SYSTEM, true).entities)).toEqual(keys(namedEntities(SYSTEM)));
        const pipeline = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');
        expect(pipeline).toMatch(/part\.tool === 'api_project'/);
        expect(pipeline).toMatch(/requestedRecords\(productRequest, \{ backendRequested: backendRequested \|\| builtAServer \}\)/);
    });

    it('api_project keeps the tables designed from his own list, whatever script keys them', async () => {
        const request = 'ابن API: الإجازات، الحضور';
        const designed = await designDataModel(request, { timeoutMs: 1 });
        expect(keys(designed)).toEqual(expect.arrayContaining([keyForPhrase('الإجازات'), keyForPhrase('الحضور')]));
        const sel = selectApiPrimary('generic', { resource: 'items', labelAr: 'العناصر', generic: true }, designed, request);
        expect(sel.explicitKeys).toEqual(expect.arrayContaining([keyForPhrase('الإجازات'), keyForPhrase('الحضور')]));
    });

    it('a list of features that names one record is no list of records', () => {
        const request = 'Build a clinic appointment management system with secure sign-in, admin and receptionist roles, patients and doctors as separate records, appointment scheduling linked to both, status transitions, search and filtering, double-booking prevention, and audit history.';
        expect(namedEntities(request)).toEqual([]);
        expect(keys(namedEntities('Build a backend with: products, search, pagination, CSV export'))).toEqual([]);
        expect(gate('Build a backend with: products, search, pagination, CSV export').unread).toEqual(['pagination']);
    });
});

/* ─────────────────────────────── R3 ─────────────────────────────── */

describe('R3 — a table he described stands in front of its list, not inside it', () => {
    it('a container in the FIRST item does not turn the list into one table\'s columns', () => {
        for (const [request, want] of [
            ['HR backend with: employee directory, payroll records, leave requests', ['employees', 'payrolls']],
            ['Inventory API with: inventory list, supplier list, purchase orders', ['inventories', 'suppliers']],
            ['تطبيق لإدارة فريق: الأعضاء، قائمة المهام، الاجتماعات', ['members', 'tasks', 'meetings']],
            ['سوي لي باك اند لمحل جوالات: الاجهزه، الزبائن، الفواتير، الصيانه', ['devices', 'customers', 'invoices']],
            ['My gym app should track: members, trainers, workouts', ['members', 'trainers', 'exercises']],
        ] as const) {
            const reading = inferModel(request);
            expect({ request, declared: !!reading.declared }).toEqual({ request, declared: false });
            expect(keys(reading.entities)).toEqual(expect.arrayContaining([...want]));
            expect(keys(reading.entities)).not.toContain('shoulds');
        }
    });

    it('…and the one table he did describe is still one table', () => {
        const reading = inferModel('بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ');
        expect(reading.declared).toBe(true);
        expect(keys(reading.entities)).toEqual(['invoices']);
        expect(inferModel('A clients table with name, phone and address').declared).toBe(true);
    });
});

/* ─────────────────────────────── R4 ─────────────────────────────── */

describe('R4 — the words in front of his list and content about a record are no tables', () => {
    it('the shape reader reads the items of a proven list, and the designer reads each item once', async () => {
        for (const [request, want] of [
            ['Library system: books, members, loans', ['books', 'members', 'loans']],
            ['Hotel system: rooms, guests, bookings', ['rooms', 'guests', 'bookings']],
            ['An app to manage: projects, tasks, invoices', ['projects', 'tasks', 'invoices']],
            ['Library system: books, members, loans, book photos', ['books', 'members', 'loans']],
            ['Gym backend: members, member fees, trainers', ['members', 'member_fees', 'trainers']],
        ] as const) {
            expect(keys(inferModel(request).entities)).toEqual([...want]);
            expect(keys(await designDataModel(request, { timeoutMs: 1 }))).toEqual([...want]);
        }
        expect(keys(await designDataModel('Backend for my shop: products, product photos, customers, customer testimonials', { timeoutMs: 1 })))
            .toEqual(['customers']);
    });

    it('an item the list reader read keeps its reading; the shape reader adds only what it could not read', async () => {
        const request = 'Build a clinic backend: patients, doctors, appointment scheduling linked to both doctors and patients';
        const designed = await designDataModel(request, { timeoutMs: 1 });
        expect(keys(designed)).toEqual(['patients', 'doctors', 'appointments']);
        // His list's hand-checked reading of «patients», not the shape reader's.
        expect(designed.find(e => e.key === 'patients')?.ar).toBe('المرضى');
        expect(designed.find(e => e.key === 'doctors')?.ar).toBe('الأطباء');
    });

    it('the stack words in front of the records and the rule after them are no tables (P151)', async () => {
        const P151 = 'Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records.';
        expect(keys(inferModel(P151).entities)).toEqual(['patients', 'appointments', 'treatments']);
        expect(keys(await designDataModel(P151, { timeoutMs: 1 }))).toEqual(['patients', 'appointments', 'treatments']);
        expect(keys(gate(P151).entities)).toEqual(['patients', 'appointments', 'treatments']);
    });

    it('Arabic content items are not tables either', () => {
        expect(keys(inferModel('ابن باك اند لمطعم: الأطباق، صور الأطباق، الطاولات، الحجوزات').entities)).toEqual(['dishes', 'tables', 'bookings']);
        expect(keys(inferModel('ابن نظام لجمعية خيرية: المتبرعين، التبرعات، قصص المستفيدين، معرض الصور').entities)).toEqual(['donors', 'donations']);
        expect(keys(inferModel('ابن نظام لمركز تدريب: الدورات، المتدربين، شهادات المتدربين').entities)).toEqual(['courses', 'trainees']);
    });

    it('the interface\'s fallback is the designer\'s own reading', async () => {
        for (const request of ['Library system: books, members, loans', 'ابن باك اند لمطعم: الأطباق، صور الأطباق، الطاولات، الحجوزات', 'ابن باك اند لمكتب: الموظفين، الإجازات، الحضور']) {
            expect(keys(readDataModel(request))).toEqual(keys(await designDataModel(request, { timeoutMs: 1 })));
        }
    });
});

/* ─────────────────────────────── R6 ─────────────────────────────── */

describe('R6 — «إدارة X» inside a colon list is one of its items', () => {
    it('the items before it are still read, and served', async () => {
        const request = 'ابن باك اند لعيادة: المواعيد، إدارة المرضى، الفواتير';
        expect(listRegion(request)?.marker).toBe('colon');
        expect(keys(namedEntities(request))).toEqual(['appointments', 'patients', 'invoices']);
        const { report } = await judged(request, ['/api/patients', '/api/invoices']);
        expect(report.missing.map(r => r.key)).toEqual(['appointments']);
        expect(keys(namedEntities('ابن باك اند لشركة شحن: جدول الرواتب، إدارة الحاويات، سجل التطعيمات')))
            .toEqual([keyForPhrase('جدول الرواتب'), 'containers', 'vaccinations']);
        expect(keys(namedEntities('Clinic backend: appointments, management of patients, invoices'))).toEqual(['appointments', 'patients', 'invoices']);
    });

    it('a head that opens the list, or stands before it, still introduces it', () => {
        expect(listRegion('ابن باك اند: إدارة المرضى والمواعيد والفواتير')?.marker).toBe('head');
        expect(listRegion('manage patients, appointments, treatments: add, edit, delete')).toEqual(
            { region: 'patients, appointments, treatments', marker: 'head', head: 'manage' });
    });
});

