/**
 * ⛔ A RECORD IS SERVED UNDER HIS OWN WORDS, NOT UNDER THE DICTIONARY'S.
 *
 * The 500-prompt exam, 2026-11-03, P153: «Build a complete full-stack system
 * for a restaurant: … management of menu items, orders, tables, and each staff
 * member only sees their own records.» The builder served the menu at
 * /api/menu (a menu_items table, add/edit/delete, behind sign-in), and Joe
 * refused it four times with «requested_entities_not_delivered: products —
 * المنتجات (not served)» — a record he never named. The list reader keys
 * «menu items» by its head «items», which the dictionary calls `products`, and
 * the gate then looked for the record only under `products`/`product`: his own
 * words, «menu» and «menu items», were never a name it could be served under.
 *
 * A record is now looked for under the dictionary's name AND his words: the
 * whole phrase (menu-items, menu_items, menuItems) and each word of it that
 * names no other record of his (menu, items). A compound route whose last word
 * is one of the record's names (/api/menu-items for «الأصناف») is that record's,
 * unless another of his records owns one of its words (/api/order-items is not
 * «الأصناف» when he also named orders). A record served under none of them is
 * still «not served», and the error names it in his words.
 *
 * Measured through Joe's own delivery path (deliveryRun.measureRequestedRecords):
 * the tree's routes are harvested, the live server is probed, the records judged.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';
import { DeliveryLedger } from '../core/quality/delivery-verdict';
import { deliveryRun } from '../core/quality/delivery-run';
import { requestedRecordWords } from '../core/quality/isolation-probe';

// The delivery run loads the pipeline (its reducers) the first time it is built: a cold transform takes a while.
jest.setTimeout(240_000);

const P153 = 'Build a complete full-stack system for a restaurant: React frontend, Node backend, user login with roles (admin and staff), management of menu items, orders, tables, and each staff member only sees their own records.';
const P153_AR = 'ابني نظام متكامل لـمطعم: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة الأصناف والطلبات والطاولات، وكل موظف يرى سجلاته فقط.';
const ORDER_ITEMS = 'Build a backend for a restaurant with a database: orders, order items, tables.';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

/** A server's source, as the builder wrote it: every route behind sign-in, a 404 for the rest of /api. */
function serverSource(resources: string[]): string {
    const routes = resources.map(r => [
        `app.get('/api/${r}', requireAuth, (req, res) => res.json(db.all('${r}')));`,
        `app.post('/api/${r}', requireAuth, (req, res) => res.status(201).json(db.add('${r}', req.body)));`,
        `app.patch('/api/${r}/:id', requireAuth, (req, res) => res.json(db.update('${r}', req.params.id, req.body)));`,
        `app.delete('/api/${r}/:id', requireAuth, (req, res) => res.status(204).end());`,
    ].join('\n')).join('\n');
    return [
        `const express = require('express');`,
        `const app = express();`,
        `app.use(express.json());`,
        `app.post('/api/auth/login', (req, res) => res.json({ token: 't' }));`,
        routes,
        `app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));`,
        `app.listen(process.env.PORT || 3000);`,
    ].join('\n');
}

/** The live server those routes describe: a served resource answers 401 without a token, anything else under /api is 404. */
async function liveServer(resources: string[]): Promise<{ base: string; close: () => Promise<void> }> {
    const server = http.createServer((req, res) => {
        const segment = String(req.url || '').split('?')[0].replace(/\/+$/u, '').split('/').filter(Boolean);
        const served = segment[0] === 'api' && segment.length === 2 && resources.includes(segment[1]);
        res.writeHead(served ? 401 : 404, { 'content-type': 'application/json' });
        res.end(JSON.stringify(served ? { error: 'Sign in first' } : { error: 'Not found' }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    return {
        base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
        close: () => new Promise<void>(resolve => server.close(() => resolve())),
    };
}

/** Joe's records gate on one built tree and its live server. */
async function measure(request: string, resources: string[]) {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-his-words-'));
    roots.push(dir);
    fs.mkdirSync(path.join(dir, 'server'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'server', 'index.js'), serverSource(resources));
    const live = await liveServer(resources);
    try {
        const ledger = new DeliveryLedger();
        const delivery = deliveryRun({
            productRequest: request,
            ledger,
            deliveryRoles: { service: true, interface: true, program: false },
            deliveredRoots: (extra = []) => Array.from(new Set([dir, ...extra].filter(r => r && fs.existsSync(r)).map(r => path.resolve(r)))),
            deliveryParts: () => [{ root: dir, tool: 'general_agent' }],
            runTool: async () => { throw new Error('no tool expected'); },
            requireInstrument: () => undefined,
        });
        ledger.record({ instrument: 'live', ok: true, url: live.base });
        await delivery.measureRequestedRecords({ ok: true, output: { cwd: dir } }, [dir]);
        const report = delivery.state.requestCoverage!;
        return { report, missing: report.missing.map(r => r.item), coverage: ledger.all().find(m => m.instrument === 'coverage') };
    } finally {
        await live.close();
    }
}

describe('P153: «menu items» served at /api/menu is his record, served', () => {
    it('the restaurant system the builder delivered is not refused for a record he never named', async () => {
        const { report, missing, coverage } = await measure(P153, ['menu', 'orders', 'tables']);
        expect(missing).toEqual([]);
        expect(report.records.map(r => r.served)).toEqual([true, true, true]);
        expect(String(coverage?.error || '')).not.toMatch(/requested_entities_not_delivered/u);
    });

    it('the whole phrase is a name too: /api/menu-items, /api/menu_items and /api/items serve it', async () => {
        for (const menu of ['menu-items', 'menu_items', 'items']) {
            const { missing } = await measure(P153, [menu, 'orders', 'tables']);
            expect({ menu, missing }).toEqual({ menu, missing: [] });
        }
    });

    it('a menu that is truly not served still fails — and is named in his words', async () => {
        const { report, coverage } = await measure(P153, ['orders', 'tables']);
        expect(report.missing.map(r => r.served)).toEqual([false]);
        expect(String(coverage?.error)).toMatch(/«menu items» \(not served\)/u);
    });
});

describe('Arabic: «الأصناف» is served under a compound name of its own word', () => {
    it('/api/menu-items serves «الأصناف»', async () => {
        const { missing } = await measure(P153_AR, ['menu-items', 'orders', 'tables']);
        expect(missing).toEqual([]);
    });

    it('…and nothing serves it when the menu is missing', async () => {
        const { report } = await measure(P153_AR, ['orders', 'tables']);
        expect(report.missing.map(r => [r.key, r.served])).toEqual([['items', false]]);
    });
});

describe('a word another of his records owns never serves this one', () => {
    it('«order items» is not served by /api/orders', async () => {
        const { missing, coverage } = await measure(ORDER_ITEMS, ['orders', 'tables']);
        expect(missing).toEqual(['order items']);
        expect(coverage?.ok).toBe(false);
    });

    it('…and /api/order-items serves it', async () => {
        const { missing, coverage } = await measure(ORDER_ITEMS, ['orders', 'order-items', 'tables']);
        expect(missing).toEqual([]);
        expect(coverage?.ok).toBe(true);
    });

    it('/api/order-items is not «الأصناف» beside his «الطلبات»', async () => {
        const { report } = await measure(P153_AR, ['order-items', 'orders', 'tables']);
        expect(report.missing.map(r => [r.key, r.served])).toEqual([['items', false]]);
    });
});

describe('the isolation probe holds a declaration to his words too', () => {
    it('the record words of P153 include «menu»', () => {
        expect(requestedRecordWords(P153)).toEqual(expect.arrayContaining(['menu', 'orders', 'tables']));
    });
});
