/**
 * ⛔ «PAYMENT STATUS» IS A FIELD OF AN INVOICE, NOT A PAYMENT GATEWAY.
 *
 * The hard exam, 2026-11-04, H01: «… invoices with payment status, a monthly
 * revenue report …». The clinic system tracked each invoice as paid or unpaid
 * (`payment_status`, thirty times in the code) and was refused after 44
 * minutes with «artifact coverage — missing: payments»: the payments
 * capability asked for Stripe, PayPal or /api/payments because the request
 * said «payment». And the parking-garage prompts of the 500 exam (P088, P138,
 * P188) manage «payments» as one of their records — spots, entries, payments —
 * which the records gate measures, not a card checkout.
 *
 * A payment's status, date, due date or history is a field. A «payments»
 * record he manages is the records gate's. A request to take payments — a
 * gateway, a card checkout, Stripe, online payments — is still the payments
 * capability, and still refused without one.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scopeReport } from '../core/quality/scope-audit';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-payments-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

const H01 = 'Build a complete clinic management system: React frontend, Node backend with SQLite, logins with three roles (admin, doctor, receptionist) and different permissions for each, patients, appointments with no double-booking and per-doctor working hours, invoices with payment status, a monthly revenue report with a chart, an audit log of every change, search and filters, an Arabic/English language switch, and automated API tests.';
const P088 = 'ابني لوحة تحكم لإدارة موقف سيارات: إضافة وتعديل وحذف وبحث في المواقف والدخول والمدفوعات، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.';
const P138 = 'Create a REST API with Node.js and Express for a parking garage with endpoints for spots, entries, payments, input validation, proper error codes, and automated tests for every endpoint.';

const INVOICES = { 'server/index.js': `const express = require('express');\nconst app = express();\napp.get('/api/invoices', (req, res) => res.json(db.all("SELECT id, total, payment_status FROM invoices")));\napp.patch('/api/invoices/:id', (req, res) => res.json(setStatus(req.params.id, req.body.payment_status === 'paid' ? 'paid' : 'unpaid')));\n` };
const PARKING = { 'server/index.js': `const express = require('express');\nconst app = express();\nfor (const t of ['spots', 'entries', 'payments']) {\n  app.get('/api/' + t, (req, res) => res.json(db.all(t)));\n  app.post('/api/' + t, (req, res) => res.status(201).json(db.add(t, req.body)));\n}\n` };

const ids = (list: Array<{ id: string }> | undefined) => (list || []).map(c => c.id);

describe('a payment\'s status is a field', () => {
    it('H01: an invoice with a payment status asks for no payment gateway', () => {
        const report = scopeReport(H01, [tree(INVOICES)]);
        expect(ids(report.requested)).not.toContain('payments');
        expect(ids(report.missing)).not.toContain('payments');
    });

    it.each([
        'Track invoices with their payment status and due date.',
        'Each order shows its payment date and payment history.',
        'اعرض الفواتير مع حالة الدفع وتاريخ الاستحقاق.',
    ])('«%s» asks for no gateway', request => {
        expect(ids(scopeReport(request, [tree(INVOICES)]).requested)).not.toContain('payments');
    });
});

describe('«payments» he manages is a record, judged by the records gate', () => {
    it.each([['P088 (Arabic)', P088], ['P138', P138]])('%s', (_name, request) => {
        const report = scopeReport(request, [tree(PARKING)]);
        expect(ids(report.missing)).not.toContain('payments');
        expect(ids(report.asRecords)).toContain('payments');
    });
});

describe('taking payments is still the payments capability', () => {
    const STORE = 'Build an online store with a cart and a checkout that takes card payments through Stripe.';

    it('a store that takes card payments, built without a gateway, is still refused', () => {
        const report = scopeReport(STORE, [tree({ 'index.html': '<!doctype html><h1>Shop</h1><button onclick="addToCart(1)">Add</button>' })]);
        expect(ids(report.missing)).toContain('payments');
    });

    it('…and delivered once it integrates one', () => {
        const report = scopeReport(STORE, [tree({ 'server.js': "const stripe = require('stripe')(process.env.STRIPE_KEY);\nconst session = await stripe.checkout.sessions.create({});" })]);
        expect(ids(report.missing)).not.toContain('payments');
    });

    it.each([
        'Accept online payments for each booking.',
        'Add a payment gateway to the checkout.',
        'أضف بوابة دفع إلكتروني للمتجر.',
    ])('«%s» asks for payments', request => {
        expect(ids(scopeReport(request, [tree({ 'index.html': '<h1>x</h1>' })]).requested)).toContain('payments');
    });
});
