/**
 * The cart runtime.
 *
 * The blueprint asks the model for "a working cart … localStorage, real JS — not
 * a mockup", and a weak model writes a badge that counts up and nothing else.
 * Multi-page sites made that worse: a cart held in a page variable empties the
 * moment the visitor clicks through, so a store that looked fine as one file was
 * visibly broken as four.
 *
 * The behaviour is verified in a real browser (three pages, add/persist/total/
 * remove/reload). What is checked here is everything that can be checked without
 * one — including the promise that the cart never claims to take money.
 */

import { cartBrief, cartRuntime, cartCss, needsCart } from '../core/design/commerce';

describe('needsCart', () => {
    it('ships with a store and nothing else', () => {
        expect(needsCart('store')).toBe(true);
        for (const k of ['landing', 'restaurant', 'blog', 'dashboard', 'docs', 'portfolio']) {
            expect(needsCart(k)).toBe(false);
        }
    });
});

describe('the markup contract handed to the model', () => {
    const brief = cartBrief();

    it('names every attribute the runtime looks for', () => {
        for (const attr of ['data-product', 'data-name', 'data-price', 'data-add', 'data-cart-open', 'data-cart-count']) {
            expect(brief).toContain(attr);
        }
    });

    it('forbids the model writing its own cart, which would fight with this one', () => {
        expect(brief).toMatch(/Do NOT write any cart JavaScript/i);
        expect(brief).toMatch(/localStorage/);
    });

    it('forbids a fake checkout', () => {
        expect(brief).toMatch(/Do NOT write a fake checkout/i);
    });
});

describe('the runtime', () => {
    const ar = cartRuntime(true);
    const en = cartRuntime(false);

    it('is a self-contained script with no dependency and no network', () => {
        expect(ar.startsWith('<script>')).toBe(true);
        expect(ar.trimEnd().endsWith('</script>')).toBe(true);
        expect(ar).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|import\s|require\s*\(/);
        expect(ar).not.toMatch(/https?:\/\//);
    });

    it('persists to localStorage rather than a page variable', () => {
        expect(ar).toContain('localStorage.getItem');
        expect(ar).toContain('localStorage.setItem');
    });

    it('survives private mode instead of taking the page down with it', () => {
        // Every storage access is wrapped; a SecurityError must not kill the
        // navigation on the rest of the page.
        expect(ar).toMatch(/try \{ localStorage\.setItem/);
        expect(ar).toMatch(/try \{ var v = JSON\.parse/);
    });

    it('re-renders on load, so the badge is right the moment another page opens', () => {
        expect(ar).toMatch(/DOMContentLoaded', render/);
        expect(ar).toMatch(/else render\(\)/);
    });

    it('renders when the panel is opened, not only when it changes', () => {
        // The panel is created lazily on first open — after the load-time
        // render — so without this the badge was right and the panel was empty.
        expect(ar).toMatch(/function open\(\) \{[\s\S]*?render\(\);/);
    });

    it('never claims an order was placed', () => {
        for (const rt of [ar, en]) {
            expect(rt).not.toMatch(/order (placed|confirmed|received)|تم الطلب|تم الشراء|شكرًا لطلبك/i);
        }
        expect(ar).toMatch(/لم يُوصَل بمزوّد دفع/);
        expect(en).toMatch(/not connected to a payment provider/);
    });

    it('speaks the language of the page', () => {
        expect(ar).toContain('سلة التسوق');
        expect(en).toContain('Your cart');
        expect(en).not.toContain('سلة التسوق');
    });

    it('is keyboard and screen-reader reachable', () => {
        expect(ar).toContain("aria-modal");
        expect(ar).toContain("'Escape'");
        expect(ar).toMatch(/aria-label/);
    });

    it('escapes nothing into a template that could break the document', () => {
        // The runtime is static text; the only interpolation is the translation
        // table, which is JSON-encoded.
        expect(ar).toContain('var T = {');
        expect(() => JSON.parse(ar.match(/var T = (\{.*?\});/s)![1])).not.toThrow();
    });
});

describe('the cart styling', () => {
    const css = cartCss();

    it('has balanced braces', () => {
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });

    it('is built on the palette tokens, not hardcoded colours', () => {
        expect(css).toContain('var(--surface)');
        expect(css).toContain('var(--brand)');
        // One deliberate exception: the destructive-action red and the backdrop.
        const hexes = css.match(/#[0-9a-f]{3,6}/gi) || [];
        expect(hexes.length).toBeLessThanOrEqual(1);
    });

    it('uses logical properties so the panel opens on the correct side in Arabic', () => {
        expect(css).toContain('inset-inline-end');
        expect(css).toContain('[dir="rtl"]');
        expect(css).not.toMatch(/\bright\s*:\s*0/);
    });

    it('respects a reduced-motion preference', () => {
        expect(css).toContain('prefers-reduced-motion');
    });
});
