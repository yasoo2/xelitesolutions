/**
 *  A TAB NAMES THE RESOURCE IT SHOWS.
 *
 *  P072, 2026-11-06: «ابني لوحة تحكم لإدارة مغسلة ملابس: … الطلبات والقطع
 *  ومواعيد الاستلام …». The model built what a professional builds —
 *  /api/orders, /api/items, /api/pickups — and an interface whose tab reads
 *  `<button data-tab="pickups">المواعيد</button>`. Joe's dictionary reads
 *  «المواعيد» as appointments, found no /api/appointments, and refused the
 *  delivery four times: «requested_entities_not_delivered: appointments —
 *  المواعيد (not served)». The label-to-name binding read only JavaScript
 *  objects; the markup that says the same thing in so many words was not read.
 *
 *  An element whose own text is the label he used, carrying a naming
 *  attribute (data-*, id, href="#…", aria-controls), binds that name — its UI
 *  words (tab, section, panel…) left out — as one more name of the record.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectServerEvidence, judgeRequestCoverage, requestedRecords } from '../core/quality/request-coverage';

const P072 = 'ابني لوحة تحكم لإدارة مغسلة ملابس: إضافة وتعديل وحذف وبحث في الطلبات والقطع ومواعيد الاستلام، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.';

const SERVER = [
    "const express = require('express');",
    'const app = express();',
    "app.get('/api/orders', (req, res) => res.json([]));",
    "app.get('/api/items', (req, res) => res.json([]));",
    "app.get('/api/pickups', (req, res) => res.json([]));",
    'module.exports = app;',
].join('\n');

let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-tab-names-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function project(html: string): void {
    fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'server.js'), SERVER);
    fs.writeFileSync(path.join(dir, 'public', 'index.html'), html);
}

async function judge() {
    const records = requestedRecords(P072, { backendRequested: true });
    const evidence = await collectServerEvidence([dir], records.entities);
    return { evidence, report: judgeRequestCoverage({ records, evidence, backendRequested: true }) };
}

test('the tab «المواعيد» that shows pickups makes /api/pickups the appointments he named', async () => {
    project('<nav><button class="tab" data-tab="orders">الطلبات</button><button class="tab" data-tab="pickups" role="tab">المواعيد</button></nav>');
    const { evidence, report } = await judge();
    expect(evidence.labelKeys.appointments).toContain('pickups');
    const appointments = report.records.find(r => r.key === 'appointments');
    expect(appointments?.served).toBe(true);
    expect(report.missing.map(r => r.key)).not.toContain('appointments');
});

test('a link to #pickups-section and an aria-controls name it the same way, UI words left out', async () => {
    project('<a href="#pickups-section">المواعيد</a>');
    expect((await judge()).evidence.labelKeys.appointments).toContain('pickups');
    project('<button aria-controls="panel-pickups">مواعيد الاستلام</button>');
    expect((await judge()).evidence.labelKeys.appointments).toContain('pickups');
});

test('without a tab that says so, appointments are still not served (the check keeps its teeth)', async () => {
    project('<h2>المواعيد</h2><div id="list"></div>');
    const { report } = await judge();
    expect(report.records.find(r => r.key === 'appointments')?.served).toBe(false);
});

test('a label that is not his word binds nothing', async () => {
    project('<button data-tab="pickups">الاستلام اليوم</button>');
    expect((await judge()).evidence.labelKeys.appointments || []).not.toContain('pickups');
});

/* ───────────── the example Joe gives never carries a transliterated name (P172) ───────────── */

import { isolationBrief } from '../core/quality/isolation-probe';

const P172 = 'ابني نظام متكامل لـمغسلة ملابس: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة الطلبات والقطع ومواعيد الاستلام، وكل موظف يرى سجلاته فقط.';

test('the isolation example names a record with a real English name, never «qtas»', () => {
    const brief = isolationBrief(P172);
    expect(brief).not.toMatch(/qtas/u);
    expect(brief).toMatch(/"list": "\/api\/(?:appointments|orders)"/u);
});
