/**
 * ⛔ A PLATFORM'S OWN WORDS ARE WHAT IT IS BUILT WITH (scope-audit.ts withoutBusinessNames).
 *
 * The r40 review, 2026-11-15: «for a multi-vendor marketplace», «for an analytics
 * platform», «for a loyalty rewards platform», «لسوق متعدد البائعين», «لمنصة تحليلات»
 * were blanked as the business the system is for, so multi-vendor, analytics and loyalty
 * were never asked and a delivery without them passed. Pinned: the words that say what
 * kind of platform, marketplace or store it is are still asked; the business a site is
 * FOR (a bakery, a shipping company, a freelance marketplace, an online store) still asks
 * nothing (the-business-it-is-for-is-not-a-feature.test.ts keeps P199/P399/P476).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { capabilityReading, CAPABILITIES, requestedCapabilities, scopeReport } from '../core/quality/scope-audit';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-platform-words-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

const ids = (request: string) => requestedCapabilities(request).map(c => c.id);
const cap = (id: string) => CAPABILITIES.find(c => c.id === id)!;
/** A server with users and nothing else: no vendors, no analytics, no loyalty. */
const BARE = { 'server.js': "app.get('/api/users', (req, res) => res.json([]));\napp.listen(3000);" };

describe('the words that say what kind of platform it is are still asked', () => {
    it.each([
        ['Build a full-stack e-commerce website for a multi-vendor marketplace', 'multi_vendor'],
        ['Build the backend for an analytics platform with charts', 'analytics'],
        ['Build a REST API for a loyalty rewards platform', 'loyalty'],
        ['Create a website for a multilingual store', 'i18n'],
        ['ابني موقعاً لسوق متعدد البائعين', 'multi_vendor'],
        ['أنشئ موقعاً لسوق إلكتروني متعدد البائعين', 'multi_vendor'],
        ['ابني واجهة خلفية لمنصة تحليلات مع رسوم بيانية', 'analytics'],
        ['ابني تطبيقاً لبرنامج ولاء للعملاء', 'loyalty'],
    ])('«%s» asks %s', (request, id) => {
        expect(capabilityReading(cap(id), request)).toBe('asked');
        expect(ids(request)).toContain(id);
    });

    it('and a delivery without them is refused for them', () => {
        expect(scopeReport('Build the backend for an analytics platform with charts', [tree(BARE)]).missing.map(c => c.id)).toContain('analytics');
        expect(scopeReport('Build a full-stack e-commerce website for a multi-vendor marketplace', [tree(BARE)]).missing.map(c => c.id)).toContain('multi_vendor');
        expect(scopeReport('Build a REST API for a loyalty rewards platform', [tree(BARE)]).missing.map(c => c.id)).toContain('loyalty');
    });
});

describe('the must-not twin: the business a site is for still asks nothing', () => {
    it('a bakery, a shipping company or service, a software company name who it is for', () => {
        expect(ids('Build a website for my bakery')).toEqual([]);
        expect(ids('Build an HR app for a shipping company with staff and payroll.')).not.toContain('shipping');
        expect(ids('Build an HR app for a shipping service with staff and payroll.')).not.toContain('shipping');
        expect(ids('Build a customer support helpdesk for an analytics company')).not.toContain('analytics');
        expect(ids('ابني تطبيق إدارة موظفين لـشركة الشحن السريع فيه قائمة الموظفين والرواتب')).not.toContain('shipping');
    });

    it('a freelance marketplace is who it is for (P199, P399, P149)', () => {
        expect(capabilityReading(cap('multi_vendor'), 'Create an interactive single-page report for a freelance marketplace that loads sample proposals data.')).toBe('business');
        expect(ids('أنشئ واجهة برمجية REST باستخدام Node.js و Express لـسوق عمل حر فيها نقاط وصول لـالخدمات والعروض والتقييمات')).not.toContain('multi_vendor');
    });

    it('a store said only to be online asks no catalogue', () => {
        expect(ids('Build a landing page for an online store with its hours and a contact button.')).not.toContain('catalog');
        expect(ids('Build an analytics dashboard for an e-commerce platform')).not.toContain('catalog');
        expect(ids('ابني صفحة هبوط لمتجر إلكتروني فيها ساعات العمل')).not.toContain('catalog');
    });
});
