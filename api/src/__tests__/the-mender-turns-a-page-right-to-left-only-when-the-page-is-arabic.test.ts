/**
 * THE MENDER TURNS A PAGE RIGHT TO LEFT ONLY WHEN THE PAGE IS ARABIC.
 *
 * Found 2026-11-15 (ui-inspection-revival-v2 §0.1): every mend runs repairHtmlShell
 * on every .html file, and it added dir="rtl" whenever the REPLY language was Arabic —
 * on <html lang="en"> too. The reply language follows Joe's interface, so an owner
 * whose Joe speaks Arabic, asking for an English site, got a right-to-left English
 * page after any mend (tap targets, field types), and the mend was kept. The page's
 * direction is the page's: its own lang, else its own words; the reply language
 * only for an empty app shell.
 *
 * AN EXISTING lang OR dir IS NEVER CHANGED (review 3 of r40, finding 10). Lang is
 * added only to an <html> with none, and dir="rtl" only to a right-to-left page with
 * no dir. Review r40-2 (C6) had rewritten a Vite shell's lang="en" to Arabic on an
 * Arabic request; that shell's lang="en" may be the builder's deliberate choice (an
 * Arabic speaker asking for an English site), and the mend then laid the whole app
 * out right to left. The two cases below that asserted the rewrite now assert the
 * opposite, deliberately: the shell keeps its lang="en".
 */
import { repairHtmlShell } from '../core/quality/ui-repair';

const shell = (htmlTag: string, body: string, title = 'Shop') =>
    `<!doctype html>${htmlTag}<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head><body>${body}</body></html>`;
const tagOf = (html: string) => (html.match(/<html\b[^>]*>/i) || [''])[0];

describe('the page decides its own direction', () => {
    test('an English page keeps left to right, whoever asked for it', () => {
        const out = repairHtmlShell(shell('<html lang="en">', '<h1>Our menu</h1><p>Fresh bread every morning.</p>'), { isArabic: true });
        expect(tagOf(out.text)).toBe('<html lang="en">');
        expect(out.repairs.map(r => r.id)).not.toContain('html_lang');
    });
    test('an Arabic page with its lang gets its direction', () => {
        expect(tagOf(repairHtmlShell(shell('<html lang="ar">', '<h1>قائمة الطعام</h1>'), { isArabic: true }).text)).toMatch(/dir="rtl"/);
    });
    test('a page with no lang and Arabic words is Arabic, whatever the reply language', () => {
        const tag = tagOf(repairHtmlShell(shell('<html>', '<h1>قائمة الطعام</h1><p>خبز طازج كل صباح</p>'), { isArabic: false }).text);
        expect(tag).toMatch(/dir="rtl"/);
        expect(tag).toMatch(/lang="ar"/);
    });
    test('a page with no lang and English words is English, though Joe speaks Arabic', () => {
        const tag = tagOf(repairHtmlShell(shell('<html>', '<h1>Our menu</h1><p>Fresh bread every morning.</p>'), { isArabic: true }).text);
        expect(tag).toMatch(/lang="en"/);
        expect(tag).not.toMatch(/dir=/);
    });
    test('an English page naming one Arabic word stays English', () => {
        const tag = tagOf(repairHtmlShell(shell('<html>', '<h1>Welcome to Café Salam</h1><p>Our chef says مرحبا to every guest who comes in.</p>'), { isArabic: true }).text);
        expect(tag).toMatch(/lang="en"/);
        expect(tag).not.toMatch(/dir=/);
    });
    test('an empty app shell follows the reply language, an English title notwithstanding', () => {
        const tag = tagOf(repairHtmlShell(shell('<html>', '<div id="root"></div><script type="module" src="/src/main.tsx"></script>', 'My App'), { isArabic: true }).text);
        expect(tag).toMatch(/dir="rtl"/);
        expect(tag).toMatch(/lang="ar"/);
    });
    test('a page that chose left to right inside Arabic is left as it chose', () => {
        const html = shell('<html lang="ar" dir="ltr">', '<h1>كود</h1>');
        expect(repairHtmlShell(html, { isArabic: true }).text).toBe(html);
    });
    test('a regional Arabic lang gets its direction', () => {
        expect(tagOf(repairHtmlShell(shell('<html lang="ar-SA">', '<h1>الأسعار</h1>'), { isArabic: false }).text)).toMatch(/dir="rtl"/);
    });
    test('a Hebrew page with no lang is Hebrew, right to left', () => {
        const tag = tagOf(repairHtmlShell(shell('<html>', '<h1>תפריט</h1><p>לחם טרי כל בוקר</p>'), { isArabic: false }).text);
        expect(tag).toMatch(/lang="he"/);
        expect(tag).toMatch(/dir="rtl"/);
    });
    /**
     *  Review 3 of r40 (finding 10), 2026-11-15: a Vite shell's `<html lang="en">` around an empty
     *  `<div id="root">` is indistinguishable from a builder's deliberate lang="en" on an English
     *  site an Arabic speaker asked for. Review r40-2 (C6) rewrote it to lang="ar" dir="rtl" on an
     *  Arabic request and turned that English app right to left; the existing lang is now kept.
     */
    test('a Vite shell with lang="en" keeps it on an Arabic request: an existing lang is never changed', () => {
        const html = shell('<html lang="en">', '<div id="root"></div><script type="module" src="/src/main.jsx"></script>', 'Vite + React');
        const out = repairHtmlShell(html, { isArabic: true });
        expect(tagOf(out.text)).toBe('<html lang="en">');
        expect(out.repairs.map(r => r.id)).not.toContain('html_lang');
    });
    test('a template shell with lang="en" whose only words are its <noscript> keeps its lang too', () => {
        expect(tagOf(repairHtmlShell(shell('<html lang="en">', '<noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div>'), { isArabic: true }).text)).toBe('<html lang="en">');
    });
    test('a template shell with NO lang whose only words are its <noscript> follows the reply language', () => {
        const tag = tagOf(repairHtmlShell(shell('<html>', '<noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div>'), { isArabic: true }).text);
        expect(tag).toMatch(/dir="rtl"/);
        expect(tag).toMatch(/lang="ar"/);
    });
    test('an existing dir is never changed, even on a page whose words are the other way', () => {
        const html = shell('<html dir="ltr">', '<h1>قائمة الطعام</h1><p>خبز طازج كل صباح</p>');
        expect(tagOf(repairHtmlShell(html, { isArabic: true }).text)).toBe('<html lang="ar" dir="ltr">');
        const rtl = shell('<html lang="en" dir="rtl">', '<h1>Our menu</h1>');
        expect(repairHtmlShell(rtl, { isArabic: false }).text).toBe(rtl);
    });
    test('the same shell in an English reply is left exactly as it is', () => {
        const html = shell('<html lang="en">', '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
        expect(tagOf(repairHtmlShell(html, { isArabic: false }).text)).toBe('<html lang="en">');
    });
    test('an empty shell that chose another lang keeps it', () => {
        expect(tagOf(repairHtmlShell(shell('<html lang="fr">', '<div id="root"></div>'), { isArabic: true }).text)).toBe('<html lang="fr">');
    });
});
