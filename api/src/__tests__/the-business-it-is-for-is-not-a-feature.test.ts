/**
 * THE BUSINESS IT IS FOR IS NOT A FEATURE TO BUILD; RECORDS HE MANAGES ARE NOT A SYSTEM.
 *
 * The 500-prompt exam on Claude, 2026-11-12/13. «… a full-stack system for a
 * freelance marketplace» (P199) and «a single-page report for a freelance
 * marketplace» (P399) were refused «missing: multi-vendor marketplace»; a
 * warehouse chatbot that «يسمح للمستخدم بحجز أو إلغاء الشحنات» and served GET
 * and POST /api/shipments (P476) was refused «missing: shipping» for 72
 * minutes. Each pair below holds both sides: the sound delivery passes, and a
 * delivery that truly lacks a capability he asked for is still refused.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { capabilityReading, CAPABILITIES, requestedCapabilities, scopeReport } from '../core/quality/scope-audit';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-business-noun-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

const ids = (request: string) => requestedCapabilities(request).map(c => c.id);
const cap = (id: string) => CAPABILITIES.find(c => c.id === id)!;
const missing = (request: string, dir: string) => scopeReport(request, [dir]).missing.map(c => c.id);

const P199 = 'Build a complete full-stack system for a freelance marketplace: React frontend, Node backend, user login with roles (admin and staff), management of gigs, proposals, reviews, and each staff member only sees their own records.';
const P399 = 'Create an interactive single-page report for a freelance marketplace that loads sample proposals data, shows three charts (by month, by category, top 5), and lets the user filter by date range.';
const P476 = 'ابني صفحة روبوت محادثة لخدمة عملاء مستودع يجاوب على الأسئلة الشائعة من قائمة مدمجة، ويسمح للمستخدم بحجز أو إلغاء الشحنات من خلال المحادثة، ويحفظ سجل المحادثة.';

/** A proposals report with no vendors anywhere. */
const REPORT = {
    'index.html': '<!doctype html><html><body><h1>Proposals</h1><input type="date" id="from"><svg id="c"></svg><script src="app.js"></script></body></html>',
    'app.js': 'const proposals = [{ id: 1, category: "Design", amount: 300 }];\nrender(proposals);',
};
/** A chatbot that books shipments through its chat route only. */
const BOT = {
    'public/index.html': '<!doctype html><html lang="ar" dir="rtl"><body><div id="log"></div><input id="msg"><script src="app.js"></script></body></html>',
    'src/server.js': "app.post('/api/chat', (req, res) => res.json(bot.reply(req.body.text)));",
    'src/bot.js': 'function reply(text) { if (/احجز/.test(text)) return store.book(text); if (/ألغ/.test(text)) return store.cancel(text); return faq(text); }',
};

describe('the business named after «for a …» / «لـ…» asks for nothing', () => {
    it('«for a freelance marketplace» names the client, not a multi-vendor marketplace to build (P199, P399)', () => {
        expect(ids(P199)).not.toContain('multi_vendor');
        expect(ids(P399)).not.toContain('multi_vendor');
        expect(capabilityReading(cap('multi_vendor'), P399)).toBe('business');
        expect(missing(P399, tree(REPORT))).not.toContain('multi_vendor');
    });

    it('a marketplace he asks to build is still asked, and refused without vendors', () => {
        const request = 'Build a multi-vendor marketplace for handmade goods where vendors list products and buyers order them.';
        expect(ids(request)).toContain('multi_vendor');
        expect(missing(request, tree(REPORT))).toContain('multi_vendor');
        expect(ids('Build a freelance marketplace with gigs and proposals.')).toContain('multi_vendor');
    });

    it('a shipping company named in Arabic asks no shipping; shipping options asked are still refused when absent', () => {
        expect(ids('ابني تطبيق إدارة موظفين لـشركة الشحن السريع فيه قائمة الموظفين والرواتب')).not.toContain('shipping');
        expect(ids('ابني نظام حضور لمكتب الشحن في المدينة')).not.toContain('shipping');
        expect(ids('Build an HR app for a shipping company with staff and payroll.')).not.toContain('shipping');
        const options = 'أضف خيارات الشحن ورسوم التوصيل للمتجر';
        expect(ids(options)).toContain('shipping');
        expect(missing(options, tree({ 'index.html': '<!doctype html><h1>متجر</h1><ul><li>عطر</li></ul>' }))).toContain('shipping');
    });

    it('a definite head keeps only its definite adjective: «أضف للمتجر سلة تسوق» still asks a cart, and is refused without one', () => {
        const request = 'أضف للمتجر سلة تسوق';
        expect(ids(request)).toContain('orders');
        expect(missing(request, tree({ 'index.html': '<!doctype html><h1>متجر</h1><ul><li>عطر</li></ul>' }))).toContain('orders');
    });

    it('«أضف سلة تسوق» with no cart is still refused', () => {
        const request = 'ابني متجر عطور وأضف سلة تسوق';
        expect(ids(request)).toContain('orders');
        expect(missing(request, tree({ 'index.html': '<!doctype html><h1>عطور</h1><ul><li>عود</li><li>مسك</li></ul>' }))).toContain('orders');
    });

    it('an API for a shopping cart still asks the cart: a cart is no organisation', () => {
        expect(ids('Build a REST API for a shopping cart with checkout.')).toContain('orders');
    });

    it('a landing page for an online store asks no catalogue; a catalogue for it is still asked', () => {
        expect(ids('Build a landing page for an online store with its hours and a contact button.')).not.toContain('catalog');
        expect(ids('Build a product catalogue for my online store.')).toContain('catalog');
    });
});

describe('shipments he books or cancels are records, not a shipping system', () => {
    it('P476: «بحجز أو إلغاء الشحنات» is the records instrument\'s, and the bot is not refused «missing: shipping»', () => {
        expect(capabilityReading(cap('shipping'), P476)).toBe('records');
        const report = scopeReport(P476, [tree(BOT)]);
        expect(report.missing.map(c => c.id)).not.toContain('shipping');
        expect((report.asRecords || []).map(c => c.id)).toContain('shipping');
    });

    it('its English twin reads the same', () => {
        expect(capabilityReading(cap('shipping'), 'Build a support chatbot page for a warehouse that lets the user book or cancel shipments through the chat.')).toBe('records');
    });

    it('a served shipments API is shipping\'s evidence (P476 served GET and POST /api/shipments)', () => {
        const request = 'Build a shipping system with shipment tracking.';
        expect(ids(request)).toContain('shipping');
        expect(missing(request, tree({ 'server.js': "if (req.method === 'GET' && p === '/api/shipments') return send(res, 200, list());" }))).not.toContain('shipping');
        expect(missing(request, tree({ 'server.js': "app.get('/api/users', (req, res) => res.json([]));" }))).toContain('shipping');
    });

    it('shipment tracking asked as a system stays a system', () => {
        expect(capabilityReading(cap('shipping'), 'ابني نظام تتبع الشحنات للعملاء')).toBe('asked');
        expect(capabilityReading(cap('shipping'), 'Build an app to track shipments and show delivery status.')).toBe('asked');
    });
});
