/**
 * «منصّة عالمية شبيهة بشوبيفاي» — AND THE THIRTEEN FEATURES NOBODY MENTIONED.
 *
 * He named fourteen capabilities. What arrived was a single-table store, under
 * a message that listed its files, its self-QA score, its design family and
 * five next commands — and never once said that multi-vendor, payments,
 * shipping, coupons, loyalty, a mobile app, analytics, support, marketing
 * automation, SEO, multi-language and multi-currency were not built.
 *
 * Not a lie. An omission the size of the request.
 *
 * The comparison is logic, so it is tested as logic. Its first live run caught
 * three of MY OWN false positives — «multi-vendor ✅» for a store whose only
 * mention of the word was inside package-lock.json — and those are pinned here
 * too, because an overstating scope report is worse than none.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    CAPABILITIES,
    formatScope,
    readProjectSource,
    requestedCapabilities,
    scopeReport,
} from '../core/quality/scope-audit';

const HIS_REQUEST = 'Build a world-class e-commerce platform similar to Shopify. Features: '
    + 'Multi-vendor marketplace AI product generation Inventory management Payments Shipping '
    + 'Coupons Loyalty program Mobile app Analytics Customer support Marketing automation SEO '
    + 'Multi-language Multi-currency Generate complete production-ready code.';

describe('what he asked for is read from his own words', () => {
    it('his platform request names a dozen capabilities, not one', () => {
        const ids = requestedCapabilities(HIS_REQUEST).map(c => c.id);
        for (const id of ['multi_vendor', 'ai_generation', 'inventory', 'payments', 'shipping',
            'coupons', 'loyalty', 'mobile_app', 'analytics', 'support', 'marketing', 'seo',
            'i18n', 'multi_currency']) {
            expect(ids).toContain(id);
        }
    });

    it('and Arabic names the same things', () => {
        const ids = requestedCapabilities(
            'ابنِ منصّة تجارة إلكترونية: سوق متعدد البائعين، إدارة المخزون، المدفوعات، الشحن، '
            + 'كوبونات خصم، برنامج الولاء، تطبيق جوال، تحليلات، دعم العملاء، تعدد اللغات، تعدد العملات').map(c => c.id);
        for (const id of ['multi_vendor', 'inventory', 'payments', 'shipping', 'coupons',
            'loyalty', 'mobile_app', 'analytics', 'support', 'i18n', 'multi_currency']) {
            expect(ids).toContain(id);
        }
    });

    it('a request that names nothing specific is not held to a specification', () => {
        expect(formatScope(scopeReport('ابن لي متجراً', []), true)).toBe('');
        expect(formatScope(scopeReport('build me a website', []), false)).toBe('');
    });
});

describe('what was built is read from the code, never from optimism', () => {
    const mk = (files: Record<string, string>) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-scope-'));
        for (const [rel, body] of Object.entries(files)) {
            const full = path.join(dir, rel);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, body, 'utf-8');
        }
        return dir;
    };

    it('a lockfile is not evidence — it is a list of other people’s code', () => {
        // This exact false positive shipped: «✅ multi-vendor marketplace» for a
        // single-table store, because package-lock.json says «vendor» a lot.
        const dir = mk({
            'package-lock.json': JSON.stringify({ packages: { 'node_modules/vendor-chunk': { version: '1.0.0' } } }),
            'src/App.jsx': 'export default function App() { return null; }',
        });
        const src = readProjectSource([dir]);
        expect(src).not.toMatch(/vendor-chunk/);
        expect(scopeReport(HIS_REQUEST, [dir]).built.map(c => c.id)).not.toContain('multi_vendor');
    });

    it('the word «vendor» is not a marketplace; a vendor_id is', () => {
        const bare = mk({ 'src/a.js': 'const vendors = "we love our vendors";' });
        expect(scopeReport(HIS_REQUEST, [bare]).built.map(c => c.id)).not.toContain('multi_vendor');
        const real = mk({ 'server.js': "app.get('/api/vendors', (req,res) => db.vendors()); // vendor_id" });
        expect(scopeReport(HIS_REQUEST, [real]).built.map(c => c.id)).toContain('multi_vendor');
    });

    it('a web manifest is not a mobile app', () => {
        const pwa = mk({ 'public.webmanifest': '{"display":"standalone"}', 'index.html': '<link rel="manifest">' });
        expect(scopeReport(HIS_REQUEST, [pwa]).built.map(c => c.id)).not.toContain('mobile_app');
        const native = mk({ 'package.json': '{"dependencies":{"react-native":"0.74.0"}}' });
        expect(scopeReport(HIS_REQUEST, [native]).built.map(c => c.id)).toContain('mobile_app');
    });

    it('a meta description is not SEO as a platform feature', () => {
        const meta = mk({ 'index.html': '<meta name="description" content="a shop"><meta property="og:title" content="x">' });
        expect(scopeReport(HIS_REQUEST, [meta]).built.map(c => c.id)).not.toContain('seo');
        const real = mk({ 'public/sitemap.xml': '<urlset/>' , 'index.html': '<script type="application/ld+json">{}</script>' });
        expect(scopeReport(HIS_REQUEST, [real]).built.map(c => c.id)).toContain('seo');
    });

    it('payments are claimed only when a payment really exists', () => {
        const talk = mk({ 'src/content.js': "export const hero = { title: 'Payments made easy' };" });
        expect(scopeReport(HIS_REQUEST, [talk]).built.map(c => c.id)).not.toContain('payments');
        const real = mk({ 'server.js': "const stripe = require('stripe'); app.post('/api/payments', ...)" });
        expect(scopeReport(HIS_REQUEST, [real]).built.map(c => c.id)).toContain('payments');
    });

    it('every capability carries both languages and two distinct patterns', () => {
        for (const c of CAPABILITIES) {
            expect(c.ar.trim().length).toBeGreaterThan(2);
            expect(c.en.trim().length).toBeGreaterThan(2);
            expect(String(c.ask)).not.toBe(String(c.evidence));
        }
        expect(new Set(CAPABILITIES.map(c => c.id)).size).toBe(CAPABILITIES.length);
    });
});

describe('and the message says it plainly', () => {
    it('names both sides and offers the next build', () => {
        const r = {
            requested: CAPABILITIES.filter(c => ['catalog', 'payments', 'shipping', 'loyalty'].includes(c.id)),
            built: CAPABILITIES.filter(c => c.id === 'catalog'),
            missing: CAPABILITIES.filter(c => ['payments', 'shipping', 'loyalty'].includes(c.id)),
        };
        const ar = formatScope(r, true);
        expect(ar).toMatch(/ما طلبتَه مقابل ما بُني — سمّيتَ 4 قدرة/);
        expect(ar).toMatch(/✅ بُنيت 1: كتالوج المنتجات/);
        expect(ar).toMatch(/❌ لم تُبنَ 3: المدفوعات · الشحن · برنامج الولاء/);
        expect(ar).toMatch(/قل «ابنِ المدفوعات»/);
        const en = formatScope(r, false);
        expect(en).toMatch(/What you asked for vs what was built — you named 4 capabilities/);
        expect(en).toMatch(/❌ Not built \(3\): payments · shipping · loyalty program/);
        expect(en).toMatch(/Say "build payments"/);
    });

    it('and says so in one line when nothing is missing', () => {
        const all = CAPABILITIES.filter(c => ['catalog', 'orders', 'accounts'].includes(c.id));
        const r = { requested: all, built: all, missing: [] };
        expect(formatScope(r, true)).toMatch(/كل ما سمّيتَه في طلبك \(3\) موجود/);
        expect(formatScope(r, false)).toMatch(/Everything you named \(3\) is in this build/);
    });

    it('and the builder puts it in the message, above the file list', () => {
        const R = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(R).toMatch(/const scopeBlock = \(\) => \{|const scopeBlock = \(\(\) => \{/);
        expect(R).toMatch(/scopeReport\(request, dirs\)/);
        // Both languages carry it, and it comes before the path.
        expect((R.match(/\$\{scopeBlock\}\$\{appBlock\}/g) || []).length).toBe(2);
    });
});
