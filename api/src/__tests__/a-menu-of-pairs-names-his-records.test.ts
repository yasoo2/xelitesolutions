/**
 * A MENU OF PAIRS NAMES HIS RECORDS (request-coverage.ts harvestLabelKeys).
 *
 * The hard sample, 2026-11-09 (L382, a municipal office's CRM): «جهات الاتصال»
 * and «قوالب البريد» have no dictionary English, and the menu said what they
 * were — ['contacts', 'جهات الاتصال'], ['templates', 'قوالب البريد'] — with links
 * to «#/contacts». The pairs were not read; the CRM, serving /api/contacts and
 * /api/templates, was refused seven times in 155 minutes: «serving not
 * measured». Pinned: a pair of a name and his word, in either order, and a
 * hash-router link whose text is his word, bind the name to his record; a pair
 * of two other words binds nothing.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectServerEvidence, requestedRecords, transliteratedOnly } from '../core/quality/request-coverage';

jest.setTimeout(120_000);

const REQUEST = 'ابني نظام CRM لمكتب شكاوى بلدية: جهات الاتصال، والأنشطة والمهام، وقوالب البريد، مع تسجيل دخول وأدوار.';

test('his words in a menu of pairs, or behind a #/ link, are bound to the names the server serves', async () => {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-pairs-'));
    try {
        fs.mkdirSync(path.join(dir, 'public'));
        fs.writeFileSync(path.join(dir, 'server.js'), [
            "const express = require('express'); const app = express();",
            "for (const r of ['contacts', 'activities', 'tasks', 'templates']) app.get('/api/' + r, (q, s) => s.json([]));",
            "app.get('/api/contacts', (q, s) => s.json([])); app.get('/api/templates', (q, s) => s.json([]));",
            'app.listen(3000);',
        ].join('\n'));
        fs.writeFileSync(path.join(dir, 'public', 'app.js'), [
            "const items = [['dashboard', 'لوحة التحكم'], ['contacts', 'جهات الاتصال'], ['activities', 'الأنشطة'],",
            "  ['tasks', 'المهام'], ['قوالب البريد', 'templates'], ['io', 'استيراد وتصدير']];",
            "nav.innerHTML = items.map(([v, l]) => `<a href=\"#/${v}\">${l}</a>`).join('');",
            "const pair = ['colour', 'أحمر'];",
        ].join('\n'));
        const recs = requestedRecords(REQUEST, { backendRequested: true }).entities;
        const ev = await collectServerEvidence([dir], recs);
        const of = (ar: string) => recs.find(r => r.ar === ar)!;
        expect(ev.labelKeys[of('جهات الاتصال').key]).toEqual(expect.arrayContaining(['contacts']));
        expect(ev.labelKeys[of('قوالب البريد').key]).toEqual(expect.arrayContaining(['templates']));
        expect(transliteratedOnly(of('جهات الاتصال'), ev.labelKeys[of('جهات الاتصال').key] || [])).toBe(false);
        expect(Object.values(ev.labelKeys).flat()).not.toContain('colour');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('a hash-router link whose own text is his word binds its name', async () => {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-pairs-'));
    try {
        fs.mkdirSync(path.join(dir, 'public'));
        fs.writeFileSync(path.join(dir, 'server.js'), "require('express')().get('/api/contacts', (q, s) => s.json([])).listen(3000);\n");
        fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<nav><a href="#/contacts">جهات الاتصال</a></nav>');
        const recs = requestedRecords(REQUEST, { backendRequested: true }).entities;
        const ev = await collectServerEvidence([dir], recs);
        const contacts = recs.find(r => r.ar === 'جهات الاتصال')!;
        expect(ev.labelKeys[contacts.key]).toEqual(expect.arrayContaining(['contacts']));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
