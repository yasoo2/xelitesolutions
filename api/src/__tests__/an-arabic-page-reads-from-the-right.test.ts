/**
 *  AN ARABIC PAGE READS FROM THE RIGHT, AND JOE MEASURES THAT ON THE PAGE.
 *
 *  The engine's browser QA (quality/app-audit.ts) had no Arabic checks at
 *  all: a page laid out left to right, a menu that reads backwards, a heading
 *  pushed to the left, buttons still in English, or an English interface for
 *  a request written in Arabic were all delivered as «nothing to fix». The
 *  checks live in quality/rtl-audit.ts and read the rendered page (computed
 *  direction, where a line really starts, where each menu item really sits),
 *  so correct logical CSS is never mistaken for a physical left.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium, type Browser } from 'playwright';
import { readRtl, rtlFindings, requestIsArabic, asksForEnglish } from '../core/quality/rtl-audit';
import { auditBuiltApp } from '../core/quality/app-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

const ASK_AR = 'ابنِ لي صفحة لعيادة أسنان فيها قائمة وحجز موعد';
const page = (htmlAttrs: string, style: string, body?: string) => `<!doctype html><html ${htmlAttrs}><head><meta charset="utf-8"><title>عيادة</title>
<style>body{font:16px sans-serif;margin:0} nav ul{display:flex;gap:24px;list-style:none;padding:0} section{width:900px;padding:16px} ${style}</style></head><body>
${body ?? `<nav><ul id="menu"><li><a href="/">الرئيسية</a></li><li><a href="/about">من نحن</a></li><li><a href="/services">خدماتنا</a></li><li><a href="/contact">تواصل معنا</a></li></ul></nav>
<main><h1>عيادة الابتسامة لطب الأسنان</h1>
<section class="card"><h2 class="title">خدماتنا المميزة</h2><p class="lead">نقدم لكم أفضل رعاية للأسنان مع فريق من الأطباء المتخصصين في التجميل والتقويم والعلاج.</p></section>
<label for="name">الاسم الكامل</label><input id="name" class="name" placeholder="اكتب اسمك هنا">
<button class="book">احجز موعداً الآن</button></main>`}
</body></html>`;

const GOOD = page('lang="ar" dir="rtl"', '.lead{padding-inline-start:20px;text-align:start}');
const LTR_PAGE = page('lang="ar"', '');
const BAD_PARTS = page('lang="ar" dir="rtl"',
    '.card{direction:ltr} nav ul{flex-direction:row-reverse} main{text-align:left} .name{direction:ltr}',
    undefined).replace('احجز موعداً الآن', 'Book now');
const ROOT_ONLY = page('', '', `<div id="root" dir="rtl" lang="ar"><nav><ul><li><a href="/">الرئيسية</a></li><li><a href="/a">من نحن</a></li><li><a href="/b">خدماتنا</a></li></ul></nav>
<h1>عيادة الابتسامة لطب الأسنان</h1><p>نقدم لكم أفضل رعاية للأسنان مع فريق من الأطباء المتخصصين.</p><p>مواعيدنا من السبت إلى الخميس من التاسعة صباحاً.</p></div>`);
const ENGLISH = page('lang="en"', '', `<nav><ul><li><a href="/">Home</a></li><li><a href="/a">About us</a></li><li><a href="/b">Services</a></li></ul></nav>
<h1>Smile Dental Clinic</h1><p>We offer the best dental care with a team of specialist doctors in cosmetics, braces and treatment.</p><button>Book an appointment</button>`);

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(getChromiumLaunchOptions()); });
afterAll(async () => { await browser?.close(); });

async function read(html: string) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
        await p.setContent(html, { waitUntil: 'load' });
        return await p.evaluate(readRtl);
    } finally { await p.close(); }
}
const ids = (html: string, request = ASK_AR) => read(html).then(r => rtlFindings(r, request).map(f => f.id).sort());

describe('the page as it is shown', () => {
    test('a correct Arabic page, logical CSS included, has nothing to fix', async () => {
        expect(await ids(GOOD)).toEqual([]);
    });

    test('an Arabic page laid out left to right is said once, as what it is', async () => {
        const r = await read(LTR_PAGE);
        expect(r.arabic).toBe(true);
        expect(r.htmlDir).toBe('ltr');
        const found = rtlFindings(r, ASK_AR);
        expect(found.map(f => f.id)).toEqual(['rtl_missing']);
        expect(found[0].severity).toBe('high');
        expect(found[0].detail).toContain('من اليسار إلى اليمين');
        expect(found[0].detailEn).toContain('dir="rtl"');
    });

    test('each wrong part of a right-to-left page is named, with where it is', async () => {
        const r = await read(BAD_PARTS);
        const found = rtlFindings(r, ASK_AR);
        expect(found.map(f => f.id).sort()).toEqual(['arabic_field_ltr', 'arabic_text_left', 'arabic_text_ltr', 'foreign_labels', 'menu_reads_backwards']);
        const by = (id: string) => found.find(f => f.id === id)!;
        expect(JSON.stringify(by('arabic_text_ltr').evidence)).toContain('خدماتنا المميزة');
        expect(by('menu_reads_backwards').detail).toContain('«الرئيسية»');
        expect(by('foreign_labels').detail).toContain('«Book now»');
        expect(JSON.stringify(by('arabic_field_ltr').evidence)).toContain('#name');
        expect(JSON.stringify(by('arabic_text_left').evidence)).toContain('عيادة الابتسامة');
    });

    test('a right-to-left app root without dir on <html> is a small fix, not a mirrored page', async () => {
        expect(await ids(ROOT_ONLY)).toEqual(['rtl_root_attributes']);
    });

    test('an English interface for an Arabic request is refused; for a request that asked for English it is not', async () => {
        expect(await ids(ENGLISH)).toEqual(['interface_not_arabic']);
        expect(await ids(ENGLISH, 'ابنِ لي صفحة لعيادة أسنان باللغة الإنجليزية')).toEqual([]);
        expect(await ids(ENGLISH, 'Build a page for a dental clinic')).toEqual([]);
    });

    test('English labels are what he asked for when he asked for two languages', async () => {
        expect(await ids(BAD_PARTS, 'ابنِ صفحة عيادة ثنائية اللغة عربي وإنجليزي')).not.toContain('foreign_labels');
    });
});

describe('reading the request', () => {
    test.each([
        ['ابنِ لي متجراً للورود', true],
        ['Build me a flower shop', false],
        ['ابنِ API لـ React dashboard', false],
    ])('«%s» is Arabic: %s', (t, want) => expect(requestIsArabic(t)).toBe(want));

    test.each([
        ['صفحة باللغة الإنجليزية', true],
        ['موقع ثنائي اللغة', true],
        ['a bilingual site', true],
        ['صفحة عيادة', false],
    ])('«%s» asks for English: %s', (t, want) => expect(asksForEnglish(t)).toBe(want));
});

describe('Joe\'s browser QA reports it', () => {
    test('an Arabic page laid out left to right is not delivered as «nothing to fix»', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-rtl-'));
        try {
            fs.writeFileSync(path.join(dir, 'index.html'), LTR_PAGE);
            const audit = await auditBuiltApp(dir, { timeoutMs: 60_000, request: ASK_AR });
            expect(audit.skipped).toBeUndefined();
            expect(audit.findings.map(f => f.id)).toContain('rtl_missing');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
});
