/**
 * ⛔ AN ITEM NO RECORD READER CAN READ IS A REQUIREMENT, AND THE JUDGE MEASURES IT.
 *
 * The hard exam, 2026-11-04, H02: «ابني نظام إدارة مدرسة متكامل: طلاب ومعلمون
 * وصفوف، جدول حصص بلا تعارض، حضور يومي، علامات وشهادات قابلة للطباعة، …».
 * The records reader keys tables; a rule («بلا تعارض»), a daily record and a
 * printout are no key it can give, and «requested items that could not be
 * read» refused the school eight times — nothing the builder could change
 * would make them readable. Each item is in his words of a requirement the
 * acceptance judge rules on, by a line it must copy out of the source.
 *
 * Items held in a requirement judged met are read; an item no met requirement
 * holds is still «could not be read»; a requirement judged unmet refuses the
 * delivery on its own, through the acceptance gate.
 */
import fs from 'fs';
import path from 'path';
import { deliveryVerdict, readAsRequirements, stillUnread, type DeliveryMeasurement } from '../core/quality/delivery-verdict';

const UNREAD = ['جدول حصص بلا تعارض', 'حضور يومي', 'شهادات قابلة للطباعة'];
const coverage: DeliveryMeasurement = { instrument: 'coverage', ok: true, unread: UNREAD };
const live: DeliveryMeasurement = { instrument: 'live', ok: true, url: 'http://127.0.0.1:4300/' };

describe('items the records reader could not read', () => {
    it('are read by the requirements the judge found met, in his words', () => {
        const met = ['جدول حصص بلا تعارض', 'حضور يومي', 'علامات وشهادات قابلة للطباعة'];
        expect(readAsRequirements(UNREAD, met)).toEqual(UNREAD);
        const verdict = deliveryVerdict({
            phaseVerified: true,
            requestFidelityBlocked: false,
            measurements: [live, coverage, { instrument: 'acceptance', ok: true, met }],
        });
        expect(verdict.unread).toEqual([]);
        expect(verdict.verified).toBe(true);
    });

    it('his letter forms aside: «شهادات قابله للطباعه» is the same words', () => {
        expect(readAsRequirements(['شهادات قابلة للطباعة'], ['علامات وشهادات قابله للطباعه'])).toEqual(['شهادات قابلة للطباعة']);
    });

    it('an item no met requirement holds is still not read', () => {
        const measurements: DeliveryMeasurement[] = [live, coverage, { instrument: 'acceptance', ok: true, met: ['حضور يومي'] }];
        expect(stillUnread(measurements)).toEqual(['جدول حصص بلا تعارض', 'شهادات قابلة للطباعة']);
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements }).verified).toBe(false);
    });

    it('a word inside another word is no match: «حضور» is not read by «الحضوري»', () => {
        expect(readAsRequirements(['حضور'], ['التعليم الحضوري'])).toEqual([]);
    });

    it('with no acceptance measurement, nothing is read', () => {
        const verdict = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: [live, coverage] });
        expect(verdict.unread).toEqual(UNREAD);
        expect(verdict.verified).toBe(false);
    });

    it('the engine hands the judge\'s met requirements to the ledger, and reports with the same reading', () => {
        const verify = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine', 'verify.ts'), 'utf-8');
        expect(verify).toMatch(/instrument: 'acceptance', ok: !judged\.blocked, error: judged\.blocked \? judged\.error : undefined, met: judged\.met \}/);
        expect(verify).toMatch(/const unread = instrument === 'coverage' \? stillUnread\(all\) : \[\];/);
    });
});
