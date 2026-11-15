/**
 * JOE'S PRINT KIT CHANGES NOTHING THE APP DECIDED, AND NO READER TAKES IT FOR HIS WORK
 * (design arabic-pdf v9 §3.1, test C).
 *
 * The kit is print.css (the v7 rule: the font only as a print default on :where(:root),
 * direction only where nothing says dir, colours exact in .joe-print, .no-print), the four
 * Cairo/Amiri woff2 of assets/fonts/ byte for byte, OFL.txt, README.md and JOE-KIT.json.
 * v7 measured it in Chromium print media: an app's own font, dir and fixed-width amounts
 * kept; 0 of 30 contrast rows worse than no kit. Every reader that judges the app, and the
 * UI mender that writes repairs into it, skips the kit.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import { appKitSource, KIT_FONTS, placeAppKit } from '../core/engine/app-kit';
import { isJoeAppKit, isJoeAppKitDir } from '../shared/utils/project-tree';
import { deliveredDocuments, judgeSource } from '../core/engine/verify';
import { collectSources } from '../core/quality/self-repair';
import { acceptanceSource } from '../core/quality/acceptance';
import { readProjectSource } from '../core/quality/scope-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-app-kit-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
let n = 0;
const project = (files: Record<string, string> = {}) => {
    const dir = path.join(tmp, `p${++n}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); }
    return dir;
};
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

/** kit7css.cjs's printCss(), the one string every v7 measurement used. */
const AR_RANGE = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
const LAT_RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const PRINT_CSS = `@font-face{font-family:'Cairo';src:url(fonts/cairo-arabic.woff2) format('woff2');unicode-range:${AR_RANGE}}
@font-face{font-family:'Cairo';src:url(fonts/cairo-latin.woff2) format('woff2');unicode-range:${LAT_RANGE}}
@font-face{font-family:'Amiri';font-weight:700;src:url(fonts/amiri-700-arabic.woff2) format('woff2');unicode-range:${AR_RANGE}}
@font-face{font-family:'Amiri';font-weight:700;src:url(fonts/amiri-700-latin.woff2) format('woff2');unicode-range:${LAT_RANGE}}
:where(.joe-print:not([dir],[dir] *)){direction:rtl}
@media print{:where(:root){font-family:'Cairo',sans-serif;color-scheme:light}:where(.joe-print),:where(.joe-print) *{print-color-adjust:exact;-webkit-print-color-adjust:exact}.no-print{display:none !important}}`;

describe('the kit and where it goes', () => {
    it('is installed with Joe, and its print.css is exactly printCss(); no rule the app would lose to', () => {
        const src = appKitSource();
        expect(src).not.toBeNull();
        const css = fs.readFileSync(path.join(src!.kitDir, 'print.css'), 'utf8');
        expect(css).toBe(PRINT_CSS);
        //  Nothing the app decides: no overflow-wrap, no @page, no html/body rule, no colour, background or alignment.
        expect(css).not.toMatch(/overflow-wrap|word-break|@page|(?:^|[},])\s*(?:html|body)\s*[{,]|(?:^|[;{])\s*(?:color|background|text-align)\s*:/u);
        expect((css.match(/!important/gu) || []).length).toBe(1);
        expect(JSON.parse(fs.readFileSync(path.join(src!.kitDir, 'JOE-KIT.json'), 'utf8'))).toEqual({ kit: 'joe-app-kit', version: 3 });
        const ofl = fs.readFileSync(path.join(src!.kitDir, 'OFL.txt'), 'utf8');
        expect(ofl).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/u);
        expect(ofl).toMatch(/Cairo, Amiri and Tajawal are licensed under the SIL Open Font License 1\.1/u);
    });

    it('its README names no feature, route or password, and shows window.print only inside a fenced block', () => {
        const readme = fs.readFileSync(path.join(appKitSource()!.kitDir, 'README.md'), 'utf8');
        expect(readme).not.toMatch(/student|invoice|certificate|password|login|\/api\//iu);
        const outside = readme.split(/```[\s\S]*?```/u).join('');
        expect(outside).not.toMatch(/window\.print/u);
        expect(readme).toMatch(/window\.print\(\)/u);
    });

    it('goes into public/vendor/joe-kit when public/ exists, vendor/joe-kit otherwise; the fonts byte for byte', async () => {
        const withPublic = project({ 'public/index.html': '<html></html>' });
        const a = await placeAppKit(withPublic);
        expect(a.dir).toBe('public/vendor/joe-kit');
        const plain = project({ 'server.js': '' });
        const b = await placeAppKit(plain);
        expect(b.dir).toBe('vendor/joe-kit');
        expect(b.written.sort()).toEqual(['JOE-KIT.json', 'OFL.txt', 'README.md', 'print.css', ...Object.keys(KIT_FONTS).map(f => `fonts/${f}`)].map(f => `vendor/joe-kit/${f}`).sort());
        const SHA: Record<string, string> = {
            'cairo-arabic.woff2': '748022f50c427456ad66031e855349be3448ee1f05a5f1eb59574ebe0c686749',
            'cairo-latin.woff2': '82c13cbd1352d76e97c3d335caa912ae68fecdc3949a43cf8d149eb892384c1b',
            'amiri-700-arabic.woff2': 'c775d9f8c3a7cf0d0c2bb5246dd699e8c09bf6f8758e1be0b98939331b18bcce',
            'amiri-700-latin.woff2': 'f53eb332acb23ec7e09e2487909c56cf841d649c970084d6a74d82aa9534f737',
        };
        for (const [f, h] of Object.entries(SHA)) expect(sha(fs.readFileSync(path.join(plain, 'vendor', 'joe-kit', 'fonts', f)))).toBe(h);
    });

    it('never writes over a file that differs from the kit\'s copy, and placing it twice writes nothing more', async () => {
        const dir = project({ 'vendor/joe-kit/print.css': '/* his own */' });
        const r = await placeAppKit(dir);
        expect(r.kept).toEqual(['vendor/joe-kit/print.css']);
        expect(fs.readFileSync(path.join(dir, 'vendor/joe-kit/print.css'), 'utf8')).toBe('/* his own */');
        const again = await placeAppKit(dir);
        expect(again.written).toEqual([]);
    });
});

describe('every reader that judges the app, and the mender, skips the kit', () => {
    const app = async () => {
        const dir = project({
            'index.html': '<!doctype html><html lang="ar" dir="rtl"><body><h1>فواتير</h1><link rel="stylesheet" href="/vendor/joe-kit/print.css"></body></html>',
            'server.js': "require('http').createServer().listen(0);\n",
            'report.md': '# تقرير المبيعات\n\nأرقام الشهر.',
        });
        await placeAppKit(dir);
        return dir;
    };

    it('isJoeAppKit / isJoeAppKitDir', () => {
        expect(isJoeAppKit('vendor/joe-kit')).toBe(true);
        expect(isJoeAppKit('public\\vendor\\joe-kit\\print.css')).toBe(true);
        expect(isJoeAppKit('vendor/joe-kitchen/x.css')).toBe(false);
        expect(isJoeAppKit('src/vendor/joe-kit/x.css')).toBe(false);
        expect(isJoeAppKitDir(path.join('a', 'public', 'vendor', 'joe-kit'))).toBe(true);
        expect(isJoeAppKitDir(path.join('a', 'vendor', 'other'))).toBe(false);
    });

    it('judgeSource, deliveredDocuments, collectSources, acceptanceSource and readProjectSource read none of it', async () => {
        const dir = await app();
        const judged = await judgeSource(dir);
        expect(judged.text).toContain('server.js');
        expect(judged.text).not.toMatch(/==== file: (?:public\/)?vendor\/joe-kit/u);
        expect(judged.text).not.toMatch(/SIL OPEN FONT LICENSE/u);
        const docs = await deliveredDocuments(dir);
        expect(docs.map(d => d.path)).toContain('report.md');
        //  OFL.txt and the README were listed as delivered documents before the skip.
        expect(docs.map(d => d.path).filter(p => p.includes('joe-kit'))).toEqual([]);
        expect(Object.keys(collectSources(dir)).filter(f => f.includes('joe-kit'))).toEqual([]);
        const pub = project({ 'public/index.html': '<html lang="ar"></html>' });
        await placeAppKit(pub);
        expect(Object.keys(collectSources(path.join(pub, 'public'))).filter(f => f.includes('joe-kit'))).toEqual([]);
        expect(await acceptanceSource(dir)).not.toMatch(/print-color-adjust|joe-app-kit/u);
        expect(readProjectSource([dir])).not.toMatch(/print-color-adjust|joe-app-kit/u);
        expect(readProjectSource([pub])).not.toMatch(/print-color-adjust|joe-app-kit/u);
    });
});

/* ───────────── in print media: the app's own decisions win ───────────── */

describe('in Chromium print media, the kit keeps what the app decided', () => {
    it('his font on body wins, his dir="ltr" stays, a .joe-print with no dir anywhere turns right-to-left, a fixed cell keeps its amount on one line', async () => {
        const dir = project({});
        await placeAppKit(dir);
        //  Pages written beside the kit and opened from disk, as a print view links it.
        let k = 0;
        const page = (body: string, head = '') => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="vendor/joe-kit/print.css">${head}</head><body>${body}</body></html>`;
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const p = await browser.newPage();
            await p.emulateMedia({ media: 'print' });
            const open = async (html: string, js: string) => {
                const file = path.join(dir, `page-${++k}.html`);
                fs.writeFileSync(file, html);
                await p.goto(`file:///${file.replace(/\\/gu, '/')}`, { waitUntil: 'load' });
                await p.evaluate('document.fonts.ready');
                return p.evaluate(js);
            };
            const measure = (html: string, js: string) => open(html, js);
            const without = (html: string, js: string) => open(html.replace(/<link[^>]+print\.css">/u, ''), js);
            const ownFont = page('<p id="t">محمد</p>', '<style>body{font-family:Tajawal,serif}</style>');
            expect(await measure(ownFont, 'getComputedStyle(document.getElementById("t")).fontFamily')).toMatch(/^Tajawal/u);
            const noFont = page('<p id="t">محمد</p>');
            expect(await measure(noFont, 'getComputedStyle(document.getElementById("t")).fontFamily')).toMatch(/Cairo/u);
            const ltr = page('<div class="joe-print" dir="ltr"><p id="t">INV-1</p></div>');
            expect(await measure(ltr, 'getComputedStyle(document.getElementById("t")).direction')).toBe('ltr');
            const ancestor = page('<div dir="ltr"><div class="joe-print"><p id="t">INV-1</p></div></div>');
            expect(await measure(ancestor, 'getComputedStyle(document.getElementById("t")).direction')).toBe('ltr');
            const bare = page('<div class="joe-print"><p id="t">محمد</p></div>');
            expect(await measure(bare, 'getComputedStyle(document.getElementById("t")).direction')).toBe('rtl');
            const cell = page('<table style="table-layout:fixed;width:120px"><tr><td style="width:60px"><span id="t">14478.16</span></td></tr></table>', '<style>body{font-family:Cairo}</style>');
            //  The amount's line boxes, with the kit and without it: the same (no overflow-wrap from the kit).
            expect(await measure(cell, 'document.getElementById("t").getClientRects().length')).toBe(await without(cell, 'document.getElementById("t").getClientRects().length'));
            const color = page('<div class="joe-print" style="background:#111;color:#fff"><p id="t">محمد</p></div>');
            expect(await measure(color, 'getComputedStyle(document.getElementById("t")).color')).toBe('rgb(255, 255, 255)');
            expect(await measure(page('<p class="no-print" id="t">x</p>'), 'getComputedStyle(document.getElementById("t")).display')).toBe('none');
        } finally { await browser.close(); }
    });
});
