/**
 * A STORE THAT CAN ACTUALLY SELL — AND A BUILD THAT FETCHES WHAT IT LACKS.
 *
 * Three things he asked for, in one place because they are one story: any
 * prompt must produce a complete, runnable system.
 *
 *   1. «e-commerce platform» must build a SHOP: a catalogue, a cart, an order
 *      that reaches the merchant. It used to detect as `inventory` and produce
 *      a stock list with prices on it.
 *   2. the biggest request must not get the weakest route: the pipeline's
 *      spine is decided by the request, not by a model's imagination.
 *   3. «واذا لم يستطع بناء اي جزء منه ان يذهب الى الانترنت وينزل اي اداة» —
 *      a build that names its missing package is one install from finishing.
 */
import { detectAppKind, blueprintFor } from '../core/design/app-blueprints';
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';
import { missingPackagesFrom, isInstallable, packageRoot } from '../core/project/dependency-healer';

const HIS_REQUEST = `Build a world-class e-commerce platform similar to Shopify.

Features:
- Multi-vendor marketplace
- Inventory management
- Payments
- Analytics

Generate complete production-ready code.`;

describe('an e-commerce request builds a shop, not a stock list', () => {
    it('his request is a store', () => {
        expect(detectAppKind(HIS_REQUEST)).toBe('store');
    });

    it('and the store runs on its own engine', () => {
        const bp = blueprintFor('store', HIS_REQUEST, false);
        expect(bp.engine).toBe('shop');
        // the fields a shop needs and an inventory list does not
        const keys = bp.fields.map(f => f.key);
        expect(keys).toEqual(expect.arrayContaining(['name', 'price', 'image', 'category']));
    });

    it.each([
        'متجر إلكتروني لبيع الملابس',
        'منصة تجارة إلكترونية',
        'an online store with a shopping cart',
        'build a marketplace like Etsy',
    ])('«%s» is a store too', (req) => {
        expect(detectAppKind(req)).toBe('store');
    });

    it.each([
        'متجر عطور فاخر',            // a boutique's WEBSITE — product cards on a page
        'موقع لمحل ملابس',
        'نظام إدارة مخزون',          // stock management is not a shopfront
    ])('«%s» is NOT turned into a shop application', (req) => {
        // Nine measured builds regressed the moment a broad /متجر/ pattern
        // landed here. What makes it an application is the transaction.
        expect(detectAppKind(req)).not.toBe('store');
    });
});

describe('the shop the scaffolder writes', () => {
    const files = buildAppFiles(
        blueprintFor('store', 'متجر إلكتروني', true),
        { isArabic: true, brand: 'متجري', storeKey: 'shop', api: 'http://localhost:4100/api/items' } as any,
        'my-shop',
    );
    const shop = files['src/components/ShopApp.jsx'];

    it('exists and is mounted by the shell', () => {
        expect(shop).toBeTruthy();
        expect(files['src/App.jsx']).toMatch(/import ShopApp from '\.\/components\/ShopApp\.jsx'/);
        expect(files['src/App.jsx']).toMatch(/<ShopApp content=\{content\} \/>/);
    });

    it('has a catalogue a customer can browse', () => {
        expect(shop).toMatch(/className="products"/);
        expect(shop).toMatch(/setQuery/);          // search
        expect(shop).toMatch(/setCategory/);       // category filter
    });

    it('has a cart that survives a reload', () => {
        expect(shop).toMatch(/createStore\(content\.storeKey \+ ':cart'\)/);
        expect(shop).toMatch(/basket\.write\(cart\)/);
        expect(shop).toMatch(/const setQty =/);
        expect(shop).toMatch(/const total = /);
    });

    it('and a checkout that writes a REAL order to the server', () => {
        expect(shop).toMatch(/apiSibling\(content\.api, 'orders'\)/);
        expect(shop).toMatch(/apiPost\(endpoint, ''/);
    });

    it('…or says plainly that the order went nowhere', () => {
        // never a "thank you for your order" for an order nobody received
        expect(shop).toMatch(/لم يصل إلى المتجر بعد|has not reached the store/);
    });

    it('the merchant can add a product and it reaches the catalogue', () => {
        expect(shop).toMatch(/const addProduct =/);
        expect(shop).toMatch(/apiCreate\(content\.api, product\)/);
    });

    it('and the shop brings its own styling', () => {
        expect(files['src/styles/app.css']).toMatch(/\.products \{/);
        expect(files['src/styles/app.css']).toMatch(/\.cart-panel \{/);
    });
});

describe('a build that names its missing tool gets it fetched', () => {
    it('reads vite\'s own wording', () => {
        const log = 'error during build:\n[vite]: Rollup failed to resolve import "recharts" from "src/App.jsx".';
        expect(missingPackagesFrom(log)).toEqual(['recharts']);
    });

    it.each([
        ["Cannot find module 'date-fns'", 'date-fns'],
        [`Module not found: Error: Can't resolve 'axios' in '/app/src'`, 'axios'],
        [`Cannot find package '@tanstack/react-query' imported from /app/src/main.jsx`, '@tanstack/react-query'],
        [`Could not resolve "framer-motion"`, 'framer-motion'],
    ])('and every other bundler\'s: %s', (log, expected) => {
        expect(missingPackagesFrom(log)).toContain(expected);
    });

    it('a deep import installs the PACKAGE, not the path', () => {
        expect(packageRoot('lodash/merge')).toBe('lodash');
        expect(packageRoot('@scope/pkg/deep/thing')).toBe('@scope/pkg');
    });

    it('never our own files, never a builtin, never a URL', () => {
        for (const s of ['./App.jsx', '../store.js', '/abs/path', 'node:fs', 'fs', 'path', 'https://x.dev/a.js', 'virtual:x']) {
            expect(isInstallable(s)).toBe(false);
        }
    });

    it('and never something already declared — that is a broken install, not a missing package', () => {
        const log = `Failed to resolve import "react" from "src/App.jsx"`;
        expect(missingPackagesFrom(log, ['react', 'react-dom'])).toEqual([]);
    });

    it('a flood of errors cannot turn into a flood of installs', () => {
        const log = Array.from({ length: 40 }, (_, i) => `Cannot find module 'pkg-${i}'`).join('\n');
        expect(missingPackagesFrom(log).length).toBeLessThanOrEqual(6);
    });
});
