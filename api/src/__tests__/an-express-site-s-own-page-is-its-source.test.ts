/**
 *  AN EXPRESS SITE'S OWN PAGE IS ITS SOURCE.
 *
 *  The 500 exam, 2026-11-07, P025: «موقع تعريفي … ونموذج تواصل يتحقق من البريد
 *  الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال». Joe built an Express server
 *  with its page in public/ — a form with an email and a phone field, three
 *  @media rules — and refused his own delivery: «artifact coverage 0% —
 *  missing: Visit contact form, responsive interface». The scope reader
 *  skipped every public/ folder, as if it only ever held a bundler's assets.
 *  Beside no bundler, public/ is the interface; beside one, it is still
 *  skipped, and a minified library is never evidence of anything.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scopeReport, readProjectSource } from '../core/quality/scope-audit';

const ASK = 'اعمل موقع تعريفي احترافي لـقسم دعم فني فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.';

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body>
<header><nav class="nav"><button class="menu-toggle" aria-expanded="false">القائمة</button><ul><li><a href="#services">الخدمات</a></li><li><a href="#contact">تواصل</a></li></ul></nav></header>
<main><section class="hero"><h1>الدعم الفني</h1></section><section id="services" class="services"><h2>خدماتنا</h2></section>
<section class="testimonials"><h2>آراء العملاء</h2></section>
<section id="contact"><form id="contact-form" novalidate><input name="name" type="text"><input name="email" type="email" required><input name="phone" type="tel" required><button type="submit">أرسل</button></form></section></main>
<script src="app.js"></script></body></html>`;
const CSS = `.nav ul{display:flex}.menu-toggle{display:none}
@media (max-width: 768px){.nav ul{display:none}.nav.open ul{display:flex;flex-direction:column}.menu-toggle{display:block}}
@media (max-width: 480px){h1{font-size:1.6rem}}`;

function project(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-scope-public-'));
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
    }
    return dir;
}

const missing = (dir: string) => scopeReport(ASK, [dir]).missing.map(c => c.en);

describe('public/ beside no bundler is the interface', () => {
    test('the form, its email field and the phone layout in public/ are found', () => {
        const dir = project({
            'package.json': JSON.stringify({ name: 'support-landing', scripts: { start: 'node server.js' }, dependencies: { express: '^4' } }),
            'server.js': "const express = require('express'); const app = express(); app.use(express.static('public')); app.listen(3000);",
            'public/index.html': PAGE,
            'public/styles.css': CSS,
            'public/app.js': "document.querySelector('.menu-toggle').addEventListener('click', () => document.querySelector('.nav').classList.toggle('open'));",
        });
        try {
            const gone = missing(dir);
            expect(gone).not.toContain('Visit contact form');
            expect(gone).not.toContain('responsive interface');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
});

describe('public/ beside a bundler is still assets', () => {
    test('a Vite project\'s public/index.html is not its interface', () => {
        const dir = project({
            'package.json': JSON.stringify({ name: 'app', scripts: { build: 'vite build' } }),
            'vite.config.js': 'export default {}',
            'public/index.html': PAGE,
            'src/main.jsx': "import React from 'react'; export default function App() { return <h1>مرحبا</h1>; }",
        });
        try {
            expect(readProjectSource([dir])).not.toContain('contact-form');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
});

describe('a library shipped minified is never evidence', () => {
    test('jquery.min.js in public/ is not read', () => {
        const dir = project({
            'server.js': "require('express')().use(require('express').static('public')).listen(3000);",
            'public/index.html': '<h1>x</h1>',
            'public/js/jquery.min.js': '/* stripe paypal payment_intent vendor marketplace */',
            'public/js/bootstrap.bundle.js': '/* checkout_session */',
        });
        try {
            const src = readProjectSource([dir]);
            expect(src).toContain('<h1>x</h1>');
            expect(src).not.toContain('payment_intent');
            expect(src).not.toContain('checkout_session');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
});

describe('a store named is a kind of business; a store built is a catalogue (L010)', () => {
    const asks = (text: string) => scopeReport(text, []).requested.map(c => c.en);
    test.each([
        'اعمل صفحة ترحيب واحدة لـمتجر عطور فيها الاسم وساعات العمل وزر اتصال.',
        'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه العطور لـمتجر عطور',
        'ابني دردشة فريق لـمتجر عطور فيها قنوات ورسائل خاصة',
    ])('«%s» asks no catalogue', text => expect(asks(text)).not.toContain('product catalogue'));
    test.each([
        'ابني متجر إلكتروني للعطور بسلة ودفع',
        'ابن لي متجراً لبيع الكتب',
        'موقع لمتجر ملابس يعرض المنتجات بالصور والأسعار',
        'Build an online store for a bakery',
    ])('«%s» does', text => expect(asks(text)).toContain('product catalogue'));
});
