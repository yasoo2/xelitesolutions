import fs from 'fs';
import path from 'path';
import { stockEngineGaps } from '../core/design/app-blueprints';

/**
 * Eval run500, 2026-10-23: an admin dashboard «with a summary page showing
 * totals and a chart» was built from the stock records engine and only then
 * blocked as requested_features_not_proven. Law 4: the request is the
 * reference. The gaps are now known before the build; a stock engine builds
 * only what it covers, otherwise a model plans from the request.
 */
describe('a stock engine only when it covers the request', () => {
    it('names what the stock engine cannot build, before the build', () => {
        const gaps = stockEngineGaps('Build an admin dashboard for a dental clinic to manage patients, appointments, treatments: add, edit, delete and search each one, with a summary page showing totals and a chart.');
        expect(gaps.join(' | ')).toMatch(/chart/);
    });

    it('a field the blueprint already has is not a gap', () => {
        expect(stockEngineGaps('Build a booking web app for a dental clinic where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view.')
            .filter(g => /name|phone/i.test(g))).toEqual([]);
    });

    it('the shop covers its own cart: removing items and updating the total', () => {
        expect(stockEngineGaps('Build an online store for a perfume store: product listing with images and prices, search and category filter, a cart that adds and removes items and updates the total, and a checkout form with validation.')).toEqual([]);
    });

    it('the pipeline plans from the request when gaps exist and a model is healthy', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
        expect(src).toContain('const hisOwnSchema = stockGaps.length && gapPlannerHealth?.ok ? null : stockPhases;');
        expect(src).toContain("stockEngineGaps(productRequest, withBackend)");
    });
});

import { requestedFeatures } from '../core/design/app-blueprints';

describe('an Arabic request is read for its features too', () => {
    // Measured 2026-10-23: features found in 25/250 English requests, 0/250 Arabic.
    it('reads the one-line list after فيه / مع', () => {
        expect(requestedFeatures('اعمل موقع تعريفي احترافي لعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل')).toEqual(
            expect.arrayContaining(['قسم رئيسي جذاب', 'الخدمات', 'آراء العملاء', 'نموذج تواصل']));
        expect(stockEngineGaps('ابني لوحة تحكم لإدارة عيادة أسنان: إضافة وتعديل وحذف وبحث في المرضى والمواعيد، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.').join(' ')).toMatch(/ملخص|بياني/);
    });

    it('a word that merely starts with و is not split', () => {
        expect(requestedFeatures('اعمل صفحة فيها وصف الخدمة، ووقت العمل، وخريطة الموقع')).toEqual(
            expect.arrayContaining(['وصف الخدمة', 'وقت العمل', 'خريطة الموقع']));
    });

    it('a store\'s own checkout validation is covered, in Arabic too', () => {
        expect(stockEngineGaps('ابني لي متجر إلكتروني لبيع العطور: عرض المنتجات بالصور والأسعار، بحث، سلة تضيف وتحذف وتحدّث المجموع، ونموذج إتمام طلب مع التحقق من البيانات.')).toEqual([]);
    });
});
