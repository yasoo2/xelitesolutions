/**
 * A TABLE HE ASKED FOR AND DID NOT GET MUST BE SAID OUT LOUD.
 *
 * Measured. He asked for two tables in one message:
 *
 *     «بدي جدول للمواعيد أسجل فيه: اسم المريض ووقت الموعد والعلاج.
 *      وبدي جدول ثاني للمصاريف أسجل فيه: البند والمبلغ والتاريخ.»
 *
 * The reader now sees both. The builder still makes one — and used to say
 * nothing about the other, which is worse than an honest refusal, because he
 * only finds out when he goes looking for a table that was never built.
 *
 * Building both is the right answer and it is not built yet. Until it is, the
 * delivery names what was left out, in his own words. The gap becomes his to
 * SEE rather than his to discover.
 *
 * This file asserts the source contract of that notice, and the reader that
 * feeds it. The honest caveat: the wording is checked here at source level
 * because the delivery string is assembled deep inside a build; what is
 * proven behaviourally is that the reader reports every table he named, and
 * that a single-table request produces nothing to declare.
 */

import fs from 'fs';
import path from 'path';
import { derivedTables } from '../core/design/app-blueprints';

const SOURCE = fs.readFileSync(
    path.join(__dirname, '../modules/tools/definitions/ReactProjectTool.ts'),
    'utf-8',
);

const TWO_AR = 'بدي جدول للمواعيد أسجل فيه: اسم المريض ووقت الموعد والعلاج. وبدي جدول ثاني للمصاريف أسجل فيه: البند والمبلغ والتاريخ.';
const ONE_AR = 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع.';

describe('a half-built request is declared, not delivered as whole', () => {
    // POSITIVE — the reader hands the builder every table, so silence is a choice.
    it('a two-table request leaves something to declare', () => {
        const tables = derivedTables(TWO_AR);
        expect(tables.length).toBeGreaterThan(1);
        expect(tables.slice(1).map(t => t.subject)).toEqual(['مصاريف']);
    });

    // POSITIVE — the builder computes the unbuilt tables from that reading.
    it('the builder reads the asked-for tables and names the ones it skipped', () => {
        expect(SOURCE).toContain('const askedTables = derivedTables(request);');
        expect(SOURCE).toContain('const unbuiltTables = askedTables.length > 1');
        expect(SOURCE).toMatch(/unbuiltTables\.length[\s\S]{0,400}ولم أبنِ/);
        expect(SOURCE).toMatch(/unbuiltTables\.length[\s\S]{0,600}did not build/);
    });

    // POSITIVE — and the notice reaches the message the user actually reads.
    it('the notice is part of the delivered app block', () => {
        expect(SOURCE).toMatch(/const appBlock = appBp \? `[^`]*\$\{unbuiltBlock\}/);
    });

    // NEGATIVE — a single-table request must declare nothing at all.
    it('a one-table request has nothing to declare', () => {
        expect(derivedTables(ONE_AR)).toHaveLength(1);
    });

    // NEGATIVE — and a request with no table at all declares nothing either.
    it.each([
        ['بحث', 'ابحث لي عن سعر الدولار اليوم'],
        ['سؤال', 'ما الفرق بين React وVue؟'],
    ])('%s has nothing to declare', (_label, ask) => {
        expect(derivedTables(ask)).toEqual([]);
    });
});
