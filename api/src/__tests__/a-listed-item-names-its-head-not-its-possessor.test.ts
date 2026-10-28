import { namedEntities } from '../core/design/named-entities';
import { inferModel } from '../core/design/entity-inference';
import { requestedRecords } from '../core/quality/request-coverage';

/**
 * Eval run500 (2026-10-26, P001-landing-ar): a dental-clinic landing page
 * «فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء …» was built with its services
 * and testimonials sections, then failed delivery with
 * «requested_entities_not_delivered: services (not built); customers (not
 * built)». «آراء العملاء» (customers' opinions — testimonials) had been read as
 * a `customers` table by its second word; the same request in English read
 * no table at all. A listed item names its head noun, never its possessor.
 */
const P001 = 'اعمل موقع تعريفي احترافي لـعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.';
const keys = (request: string) => namedEntities(request).map(e => e.key);

describe('a listed item names its head, not its possessor', () => {
    it('P001: a landing page\'s sections in Arabic are not records, as in English', () => {
        expect(keys(P001)).toEqual([]);
        // Round 20 added the stated rules and behaviour clauses to the reading — none here.
        expect(requestedRecords(P001, { backendRequested: false })).toEqual({ entities: [], unread: [], capabilities: [], clauses: [], testsRequested: null });
    });
    it('«آراء العملاء» and «صور المنتجات» do not make customers or products tables', () => {
        const k = keys('ابنِ نظاماً لمكتبة فيه: الكتب، والأعضاء، وآراء العملاء، وصور المنتجات');
        expect(k).toEqual(expect.arrayContaining(['books', 'members']));
        expect(k).not.toContain('customers');
        expect(k).not.toContain('products');
    });
    it('English reads the head last: «customer reviews» are not customers', () => {
        const k = keys('Build a library system with: books, members, customer reviews');
        expect(k).toEqual(expect.arrayContaining(['books', 'members']));
        expect(k).not.toContain('customers');
    });
    it('a head that holds or works the records still names them', () => {
        expect(keys('نظام لعيادة فيه: سجل المرضى، وجدول المواعيد')).toEqual(expect.arrayContaining(['patients', 'appointments']));
        expect(keys('A clinic app with: patient records, appointment list')).toEqual(expect.arrayContaining(['patients', 'appointments']));
    });
    it('a two-word noun on the list is read whole before its words', () => {
        const k = keys('نظام مبيعات فيه: العملاء المحتملون، والفواتير');
        expect(k).toEqual(expect.arrayContaining(['contacts', 'invoices']));
        expect(k).not.toContain('customers');
    });
});

/**
 * Round 21 review of e1e95b0e: the possessor spoke only after a head from a
 * short list of record-keeping words, so every other head silenced it —
 * «doctor profiles, appointment scheduling, patient history» read no table,
 * nor did «اداره المرضى، وقائمه المواعيد» written with ه, and the delivery
 * gate, handed nothing, required nothing. The head silences the possessor
 * only when it is content ABOUT it: what people said, or what shows it.
 */
const CLINIC_EN = 'Build a clinic backend with: doctor profiles, appointment scheduling, patient history';
const CLINIC_AR_INFORMAL = 'نظام لعيادة فيه: اداره المرضى، وقائمه المواعيد';

describe('the possessor names the record unless the head is content about it', () => {
    it('English: a doctor profile is a doctor; scheduling and history are done to appointments and patients', () => {
        expect(keys(CLINIC_EN)).toEqual(['doctors', 'appointments', 'patients']);
        expect(requestedRecords(CLINIC_EN, { backendRequested: true }).entities.map(e => e.key)).toEqual(['doctors', 'appointments', 'patients']);
    });
    it('Arabic, in the spelling he typed: «اداره المرضى، وقائمه المواعيد» are patients and appointments', () => {
        expect(keys(CLINIC_AR_INFORMAL)).toEqual(['patients', 'appointments']);
        expect(keys('نظام لعيادة فيه: إدارة المرضى، وقائمة المواعيد')).toEqual(['patients', 'appointments']);
        expect(requestedRecords(CLINIC_AR_INFORMAL, { backendRequested: true }).entities.map(e => e.key)).toEqual(['patients', 'appointments']);
    });
    it('English: testimonials and photos of a thing are not its table', () => {
        const k = keys('Build a library system with: books, members, customer testimonials, product photos');
        expect(k).toEqual(['books', 'members']);
    });
    it('Arabic, without the hamza and with ه: «اراء العملاء» and «صوره المنتجات» are not tables either', () => {
        const k = keys('ابنِ نظاماً لمكتبة فيه: الكتب، والأعضاء، واراء العملاء، وصوره المنتجات');
        expect(k).toEqual(['books', 'members']);
    });
    it('behind an interface head, opinions are a resource of their own — never a customers table', () => {
        const read = namedEntities('أنشئ واجهة برمجية REST لمكتبة فيها نقاط وصول لـالكتب والأعضاء وآراء العملاء');
        expect(read.map(e => e.key).slice(0, 2)).toEqual(['books', 'members']);
        expect(read.map(e => e.key)).not.toContain('customers');
        expect(read[2]?.ar).toBe('آراء العملاء');
        // and the shape reader reads the item the same way
        expect(inferModel('ابنِ نظاماً لمكتبة: الكتب، والأعضاء، وآراء العملاء').entities.map(e => e.key)).not.toContain('customers');
    });
});

/**
 * Round 21 (after the head-noun rule above): the delivery gate still read a
 * two-word item by ANY of its words. «صور المنتجات» in a library system
 * demanded a products table the builder rightly never made, so a server that
 * served everything he asked for failed as «not served»; and «member photos»
 * was silently passed as delivered because a members table existed. The gate
 * reads an item the way the builders read it.
 */
describe('the delivery gate reads an item the way the builders do', () => {
    it('content about a record is not that record\'s table, in Arabic or English', () => {
        const ar = requestedRecords('ابنِ نظاماً لمكتبة فيه: الكتب، والأعضاء، وآراء العملاء، وصور المنتجات', { backendRequested: true });
        expect(ar.entities.map(e => e.key)).toEqual(['books', 'members']);
        const en = requestedRecords('Build a library backend with: books, members, customer testimonials, product photos', { backendRequested: true });
        expect(en.entities.map(e => e.key)).toEqual(['books', 'members']);
        // Not built as records and not measurable: said, never failed and never passed.
        expect(en.unread).toEqual(['customer testimonials', 'product photos']);
    });
    it('content about a record he also listed is not delivered by that record\'s table', () => {
        const en = requestedRecords('Build a library backend with: books, members, member photos', { backendRequested: true });
        expect(en.entities.map(e => e.key)).toEqual(['books', 'members']);
        expect(en.unread).toEqual(['member photos']);
        const ar = requestedRecords('ابنِ نظاماً لمكتبة فيه: الكتب، والأعضاء، وصور الأعضاء', { backendRequested: true });
        expect(ar.unread).toEqual(['صور الأعضاء']);
    });
    it('an item still names the record its head or its possessor is', () => {
        expect(requestedRecords('ابنِ نظاماً لعيادة فيه: الأطباء، ومواعيد المرضى', { backendRequested: true }).entities.map(e => e.key))
            .toEqual(['doctors', 'appointments']);
        expect(requestedRecords(CLINIC_EN, { backendRequested: true }).unread).toEqual([]);
    });
});
