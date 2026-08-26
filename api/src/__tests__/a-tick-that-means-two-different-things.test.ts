/**
 * ONE GREEN TICK FOR «1 OF 5 PROVEN» AND FOR «5 OF 5 PROVEN».
 *
 * Measured in the source, not recalled: acceptance was granted on
 * `unmet === 0 && met > 0`, and the ledger head opened with ✅ on both of
 * these ledgers:
 *
 *     criteria 5 · met 1 · unmet 0 · unprovable 4   ->  ✅
 *     criteria 5 · met 5 · unmet 0 · unprovable 0   ->  ✅
 *
 * The first says, after the tick, that four of the five were never checked.
 * It is a true sentence under a mark that contradicts it, and the mark is
 * what the eye reads first. So the owner is told «done» about a delivery in
 * which four fifths of his request was never looked at.
 *
 * THE CLASS is already named in this repository's own history —
 * «a boolean that means two things cannot be guarded». `accepted` was
 * answering two different questions at once:
 *
 *     1. may this be delivered?          (nothing looked-for is missing)
 *     2. was everything he asked proven?  (no gaps at all)
 *
 * They are separated where each belongs rather than merged. `accepted`
 * stays question 1, because tying DELIVERY to question 2 would wall off
 * every request carrying a criterion this judge cannot check — and the
 * reference prompt itself carries one («Do not modify existing projects»),
 * so that gate would never open again, which is a criterion that can never
 * be met and the same defect wearing the other face. The MARK answers
 * question 2, and nothing short of everything earns a tick.
 *
 * The negative cases matter as much: a complete run must still earn its
 * tick, and a blocked delivery must still be blocked. A fix that withheld
 * the tick from everything would close this by making the mark useless.
 */

import { judgeAcceptance, acceptanceBlock, type Criterion } from '../core/quality/acceptance';

/** A criterion whose evidence is a column label — provable from source. */
const provable = (n: number, label: string): Criterion => ({
    id: `column:text${n}`, kind: 'feature',
    ar: `عمود «${label}»`, en: `a column «${label}»`,
    expectedColumn: label,
});

/** A stated prohibition — real, judged, and not checkable from source. */
const unprovableRule = (n: number): Criterion => ({
    id: `rule:${n}`, kind: 'feature',
    ar: 'شرطك', en: 'your condition',
    expectedRule: { text: `do not do thing ${n}`, kind: 'forbid' },
});

import fs from 'fs';
import os from 'os';
import path from 'path';

function sourceWith(labels: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-tick-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'App.jsx'),
        'const fields = [' + labels.map(l => `{ key: 'k', label: '${l}', type: 'text' }`).join(',') + '];');
    return dir;
}

describe('a tick means everything he asked for was proven — nothing less', () => {
    it('POSITIVE — one proven of five carries NO tick, in both languages', () => {
        const dir = sourceWith(['الاسم']);
        try {
            const a = judgeAcceptance(
                [provable(1, 'الاسم'), unprovableRule(1), unprovableRule(2), unprovableRule(3), unprovableRule(4)],
                { dir }, true,
            );
            expect(a.met).toBe(1);
            expect(a.unmet).toBe(0);
            expect(a.unprovable).toBe(4);
            //  Delivery is still allowed — the gate and the mark are different
            //  questions, and walling this off is the defect's mirror image.
            expect(a.accepted).toBe(true);
            //  But the mark he reads must not say «done».
            expect(acceptanceBlock(a, true).startsWith('✅')).toBe(false);
            expect(acceptanceBlock(a, false).startsWith('✅')).toBe(false);
            //  …and it still names the gap and its number.
            expect(acceptanceBlock(a, false)).toContain('4 of your request I did not know how to check');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it('NEGATIVE — everything proven still earns its tick', () => {
        const dir = sourceWith(['الاسم', 'الكمية']);
        try {
            const a = judgeAcceptance([provable(1, 'الاسم'), provable(2, 'الكمية')], { dir }, true);
            expect(a.met).toBe(2);
            expect(a.unprovable).toBe(0);
            expect(a.accepted).toBe(true);
            expect(acceptanceBlock(a, true).startsWith('✅')).toBe(true);
            expect(acceptanceBlock(a, false)).toContain('all 2/2 requested criteria were proven');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it('NEGATIVE — a criterion looked for and missing still blocks delivery', () => {
        const dir = sourceWith(['الاسم']);
        try {
            const a = judgeAcceptance([provable(1, 'الاسم'), provable(2, 'غير موجود')], { dir }, true);
            expect(a.unmet).toBe(1);
            expect(a.accepted).toBe(false);
            expect(acceptanceBlock(a, false)).toContain('Delivery blocked');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it('NEGATIVE — a run that proved nothing at all is not accepted', () => {
        const a = judgeAcceptance([unprovableRule(1), unprovableRule(2)], { dir: '' } as any, true);
        expect(a.met).toBe(0);
        expect(a.accepted).toBe(false);
    });
});
