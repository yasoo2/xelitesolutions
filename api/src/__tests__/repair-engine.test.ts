/**
 * Mechanical repairs: every rule must fix its defect deterministically, touch
 * NOTHING it was not asked about, and be idempotent (a second run is a no-op).
 */
import { applyMechanicalRepairs } from '../core/quality/repair-engine';

const f = (...codes: string[]) => codes.map(code => ({ code }));

describe('repair-engine — mechanical repairs', () => {
    test('quirks: prepends DOCTYPE exactly once', () => {
        const r = applyMechanicalRepairs('<html><head></head><body>x</body></html>', f('quirks'));
        expect(r.html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(r.applied).toContain('quirks');
        const again = applyMechanicalRepairs(r.html, f('quirks'));
        expect(again.applied).toHaveLength(0);
        expect(again.html).toBe(r.html);
    });

    test('lang_missing + rtl_missing: Arabic page gets lang and dir on <html>', () => {
        const r = applyMechanicalRepairs('<!DOCTYPE html><html><head></head><body>مرحبا</body></html>',
            f('lang_missing', 'rtl_missing'), { language: 'ar' });
        expect(r.html).toMatch(/<html[^>]*lang="ar"/);
        expect(r.html).toMatch(/<html[^>]*dir="rtl"/);
        expect(r.applied).toEqual(expect.arrayContaining(['lang_missing', 'rtl_missing']));
    });

    test('rtl_missing is NOT applied to a non-Arabic build', () => {
        const r = applyMechanicalRepairs('<html><body>hi</body></html>', f('rtl_missing'), { language: 'en' });
        expect(r.html).not.toMatch(/dir="rtl"/);
        expect(r.applied).toHaveLength(0);
    });

    test('no_title: synthesises the title from the real h1', () => {
        const r = applyMechanicalRepairs(
            '<html><head></head><body><h1>مطعم <em>الأصالة</em></h1></body></html>', f('no_title'));
        expect(r.html).toMatch(/<title>مطعم الأصالة<\/title>/);
    });

    test('no_title: falls back to the build subject, and fills an EMPTY <title>', () => {
        const r = applyMechanicalRepairs(
            '<html><head><title></title></head><body><p>x</p></body></html>',
            f('no_title'), { subject: 'موقع عيادة أسنان' });
        expect(r.html).toMatch(/<title>موقع عيادة أسنان<\/title>/);
        expect((r.html.match(/<title/g) || []).length).toBe(1);
    });

    test('no_viewport: injects the meta into <head>', () => {
        const r = applyMechanicalRepairs('<html><head><title>x</title></head><body></body></html>', f('no_viewport'));
        expect(r.html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1">/);
        expect(r.html.indexOf('viewport')).toBeLessThan(r.html.indexOf('</head>'));
    });

    test('no_meta_description: uses the first paragraph, escaped', () => {
        const r = applyMechanicalRepairs(
            '<html><head></head><body><p>أفضل "قهوة" في المدينة & أرخصها</p></body></html>', f('no_meta_description'));
        expect(r.html).toMatch(/<meta name="description" content="أفضل &quot;قهوة&quot; في المدينة &amp; أرخصها">/);
    });

    test('duplicate_ids: first keeps its id, later ones are renamed', () => {
        const r = applyMechanicalRepairs(
            '<div id="hero"></div><div id="hero"></div><div id="hero"></div><div id="menu"></div>',
            f('duplicate_ids'));
        expect(r.html).toContain('id="hero"');
        expect(r.html).toContain('id="hero-2"');
        expect(r.html).toContain('id="hero-3"');
        expect(r.html).toContain('id="menu"');
        expect((r.html.match(/id="hero"/g) || []).length).toBe(1);
    });

    test('blank_no_noopener: adds rel, and extends an existing rel without clobbering it', () => {
        const r = applyMechanicalRepairs(
            '<a href="https://x.com" target="_blank">a</a>'
            + '<a href="https://y.com" target="_blank" rel="nofollow">b</a>'
            + '<a href="/local">c</a>',
            f('blank_no_noopener'));
        expect(r.html).toMatch(/<a rel="noopener noreferrer" href="https:\/\/x\.com" target="_blank">/);
        expect(r.html).toMatch(/rel="nofollow noopener noreferrer"/);
        expect(r.html).toContain('<a href="/local">c</a>');
    });

    test('http_resources: upgrades to https but never touches localhost', () => {
        const r = applyMechanicalRepairs(
            '<img src="http://cdn.example.com/a.jpg"><script src="http://localhost:5002/x.js"></script>',
            f('http_resources'));
        expect(r.html).toContain('https://cdn.example.com/a.jpg');
        expect(r.html).toContain('http://localhost:5002/x.js');
    });

    test('img_no_alt: adds empty (decorative) alt only where alt is missing', () => {
        const r = applyMechanicalRepairs(
            '<img src="a.jpg"><img src="b.jpg" alt="وصف حقيقي">', f('img_no_alt'));
        expect(r.html).toContain('<img alt="" src="a.jpg">');
        expect(r.html).toContain('alt="وصف حقيقي"');
    });

    test('focus_suppressed: restores a :focus-visible outline once', () => {
        const r = applyMechanicalRepairs('<html><head></head><body></body></html>', f('focus_suppressed'));
        expect(r.html).toContain('joe-focus-restore');
        const again = applyMechanicalRepairs(r.html, f('focus_suppressed'));
        expect(again.applied).toHaveLength(0);
    });

    test('discipline: rules NEVER fire for codes the audit did not report', () => {
        const broken = '<html><body><img src="http://x.com/a.jpg"><a target="_blank" href="https://x.com">x</a></body></html>';
        const r = applyMechanicalRepairs(broken, f('contrast', 'overflow'));
        expect(r.html).toBe(broken);
        expect(r.applied).toHaveLength(0);
    });

    test('every applied repair carries an Arabic log line', () => {
        const r = applyMechanicalRepairs(
            '<html><head></head><body><h1>عنوان</h1><p>فقرة كافية الطول للوصف هنا</p></body></html>',
            f('quirks', 'no_title', 'no_viewport', 'no_meta_description'), { language: 'ar' });
        expect(r.applied.length).toBeGreaterThanOrEqual(4);
        expect(r.notesAr.length).toBe(r.applied.length);
        for (const note of r.notesAr) expect(note).toMatch(/[؀-ۿ]/);
    });

    test('a already-clean page passes through byte-identical', () => {
        const clean = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>ع</title>'
            + '<meta name="viewport" content="width=device-width, initial-scale=1">'
            + '<meta name="description" content="وصف"></head><body><h1>ع</h1></body></html>';
        const r = applyMechanicalRepairs(clean,
            f('quirks', 'no_title', 'no_viewport', 'no_meta_description', 'lang_missing', 'rtl_missing'),
            { language: 'ar' });
        expect(r.html).toBe(clean);
        expect(r.applied).toHaveLength(0);
    });
});
