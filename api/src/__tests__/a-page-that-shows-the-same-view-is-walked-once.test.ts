/**
 * A PAGE THAT SHOWS THE SAME VIEW IS WALKED ONCE (app-audit.ts viewKey).
 *
 * The ladder, 2026-11-09 (L155, a photo studio's admin): «/» rendered the
 * summary and «/summary» was walked again in full, at desktop, tablet and phone
 * width. A view is known by its headings, fields, table columns and buttons,
 * data rows aside; a page with no heading is never taken for another.
 */
import fs from 'fs';
import path from 'path';
import { viewKey } from '../core/quality/app-audit';

const summary = { headings: ['لوحة الاستوديو', 'الملخص'], fields: [], columns: [], actions: ['تحديث'] };

test('the same view is the same key, whatever the data and the order', () => {
    expect(viewKey(summary)).toBe(viewKey({ headings: ['الملخص', ' لوحة  الاستوديو', 'الملخص'], fields: [], columns: [], actions: ['تحديث', 'تحديث'] }));
});

test('another page, or a page with no heading, is never the same', () => {
    const sessions = { headings: ['لوحة الاستوديو', 'الجلسات'], fields: ['q', 'client'], columns: ['التاريخ', 'العميل'], actions: ['إضافة جلسة'] };
    const clients = { headings: ['لوحة الاستوديو', 'العملاء'], fields: ['q', 'name'], columns: ['الاسم', 'الهاتف'], actions: ['إضافة عميل'] };
    expect(viewKey(sessions)).not.toBe(viewKey(clients));
    expect(viewKey(sessions)).not.toBe(viewKey(summary));
    expect(viewKey({ headings: [], fields: ['a'], actions: ['b'] })).toBe('');
    expect(viewKey(null)).toBe('');
});

test('the walk skips a repeated view, and measures it at other widths as the page it repeats', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../core/quality/app-audit.ts'), 'utf8');
    expect(src).toMatch(/sameViewAs\.set\(r, shownBefore\);[\s\S]{0,200}continue;/);
    expect(src).toMatch(/responsiveRoutes = \[\.\.\.new Set\(\(routes\.length \? routes : \['\/'\]\)\.map\(r => sameViewAs\.get\(r\) \?\? r\)\)\]/);
});
