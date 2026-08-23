/**
 * HIS COLUMNS ARE THE CRITERIA.
 *
 * Measured live on his own brief — five columns, a search, a total — after
 * the build succeeded:
 *
 *     «I could not derive a checkable criterion from your request,
 *      so I did not issue an acceptance judgment.»
 *
 * The schema layer had already read every one of those columns from the same
 * sentence. The judge derived nothing, because it knew only five criteria it
 * had been taught: counter, button, title, status message, search. A
 * CHECKLIST — in the one place the fourth law says must come from the request:
 *
 *     «معايير القبول تُشتقّ من نصّ الطلب نفسه، لا من قائمةٍ محفوظةٍ من
 *      الأشكال المعروفة»
 *
 * A column he named is the most checkable criterion there is: it is either a
 * field in the built app or it is not. And the evidence must be that it is a
 * COLUMN — a label in the generated schema — not that the words appear
 * somewhere in a file, which a comment could satisfy.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { acceptanceFor, judgeAcceptance } from '../core/quality/acceptance';

const CLINIC = 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع.';
const COLUMNS = ['اسم المريض', 'رقم تلفونه', 'وقت الموعد', 'نوع العلاج', 'المبلغ المدفوع'];

const projectWith = (labels: string[]): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-columns-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'content.js'),
        'export const content = {\n  fields: [\n'
        + labels.map((l, i) => `    { key: 'f${i}', label: '${l}', type: 'text' },`).join('\n')
        + '\n  ],\n};\n', 'utf-8');
    return dir;
};

describe('a column he named is a criterion that can be checked', () => {
    // POSITIVE — every column becomes its own criterion, in his words.
    it('the clinic brief derives one criterion per column', () => {
        const criteria = acceptanceFor(CLINIC);
        expect(criteria.map(c => c.expectedColumn).filter(Boolean)).toEqual(COLUMNS);
    });

    // POSITIVE — and a project that has them is judged met.
    it('a project carrying his columns is met', () => {
        const dir = projectWith(COLUMNS);
        try {
            const judged = judgeAcceptance(acceptanceFor(CLINIC), { dir }, true);
            const columns = judged.criteria.filter(c => c.expectedColumn);
            expect(columns).toHaveLength(5);
            expect(columns.every(c => c.verdict === 'met')).toBe(true);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    // NEGATIVE — a missing column is unmet, and named.
    it('a column that was dropped is reported unmet by name', () => {
        const dir = projectWith(COLUMNS.filter(l => l !== 'نوع العلاج'));
        try {
            const judged = judgeAcceptance(acceptanceFor(CLINIC), { dir }, true);
            const missing = judged.criteria.filter(c => c.expectedColumn && c.verdict === 'unmet');
            expect(missing).toHaveLength(1);
            expect(missing[0].expectedColumn).toBe('نوع العلاج');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    // NEGATIVE — the words in a comment are not a column.
    it('a label mentioned in prose does not count as a column', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-prose-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'content.js'),
            '// the user asked for اسم المريض and وقت الموعد\nexport const content = { fields: [] };\n', 'utf-8');
        try {
            const judged = judgeAcceptance(acceptanceFor(CLINIC), { dir }, true);
            expect(judged.criteria.filter(c => c.expectedColumn).every(c => c.verdict === 'unmet')).toBe(true);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    // NEGATIVE — the reference prompt's count must not move.
    it('Gate062 still derives exactly its four criteria', () => {
        const gate = acceptanceFor('Build a small project called Gate062. Create one polished page titled Gate 062 with a heading, a short status message, and a button that increments a visible counter.');
        expect(gate.map(c => c.id)).toEqual(['counter', 'button', 'title', 'status_message']);
    });

    // NEGATIVE — a request that lists no columns adds none.
    it('a request with no column list adds no column criteria', () => {
        expect(acceptanceFor('ابن لي موقع لمطعم').filter(c => c.expectedColumn)).toEqual([]);
    });
});
