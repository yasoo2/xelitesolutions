/**
 * THE ✅ ON HIS RULE WAS EARNED BY ANY DIGIT, ANYWHERE IN THE PROJECT.
 *
 * From «اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر ولا تقبل سعرًا صفرًا»,
 * the judge reported:
 *
 *     your condition: «لا تقبل سعرًا صفرًا» — the bound is in the schema
 *
 * The proof behind that line was, in full:
 *
 *     const bounded = !!src && /min:\s*-?\d/.test(src);
 *
 * One `min:` followed by a digit, ANYWHERE in the generated source. It never
 * asked which column carried it, never compared the number to the one he gave,
 * and — the part that matters — never looked for `minExclusive`.
 *
 * That last omission is not a weak proof, it is a false one. «لا تقبل سعرًا
 * صفرًا» forbids the value itself. A schema carrying `min: 0` with no
 * `minExclusive` ACCEPTS zero. So a build doing the exact opposite of what he
 * asked would be reported as obeying him, on evidence that reads as rigorous.
 *
 * And the reader had all three facts the whole time: `StatedRule` carries
 * `field`, `min` and `minExclusive`, and the criterion copied `text` and
 * `kind` and dropped the rest. A seam again — one side knows, the other never
 * asks — this time between two functions in the same directory.
 *
 * A criterion that cannot fail is not strictness. It is the defect this
 * project keeps deleting, and it had grown back at the centre of the fourth
 * law.
 */

import { judgeAcceptance, acceptanceFor } from '../core/quality/acceptance';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REQUEST = 'اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر ولا تقبل سعرًا صفرًا';

/** One schema line per column, in the shape the generator really writes. */
const schema = (cols: string[]) => `export const content = {
  fields: [
${cols.map(c => `    ${c},`).join('\n')}
  ],
};`;

const OBEYS = schema([
    "{ key: 'text1', label: 'اسم الصنف', type: 'text', required: true, primary: true }",
    "{ key: 'count1', label: 'الكمية', type: 'number' }",
    "{ key: 'money1', label: 'السعر', type: 'number', required: true, min: 0, minExclusive: true }",
]);

/**  The judge reads the project off DISK, so the probe writes one. */
const ruleVerdict = (src: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-bound-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'content.js'), src, 'utf-8');
    const judged = judgeAcceptance(acceptanceFor(REQUEST), { dir } as any);
    fs.rmSync(dir, { recursive: true, force: true });
    const rule = judged.criteria.find(c => c.id.startsWith('rule:'));
    return rule ? { verdict: rule.verdict, why: rule.why } : null;
};

describe('a bound is proven on his column, at his number, at his strictness', () => {
    it('the criterion is derived at all — an empty judgement proves nothing', () => {
        expect(acceptanceFor(REQUEST).some(c => c.id.startsWith('rule:'))).toBe(true);
        expect(ruleVerdict(OBEYS)).not.toBeNull();
    });

    it('a build that really obeys him is met, and says which column carries it', () => {
        const v = ruleVerdict(OBEYS)!;
        expect(v.verdict).toBe('met');
        expect(v.why).toContain('السعر');
    });

    it('a build that accepts the very value he forbade is NOT met', () => {
        //  The defect, exactly. `min: 0` with no `minExclusive` admits zero.
        //  This passed before, with the words «the bound is in the schema».
        const admitsZero = OBEYS.replace(', minExclusive: true', '');
        const v = ruleVerdict(admitsZero)!;
        expect(v.verdict).toBe('unmet');
        expect(v.why).toMatch(/يقبل القيمة نفسها|admits the value itself/);
    });

    it('a bound on the wrong column is NOT met', () => {
        //  His rule was about «السعر». A floor under «الكمية» is a different
        //  promise, and it used to earn the same tick.
        const wrongColumn = schema([
            "{ key: 'text1', label: 'اسم الصنف', type: 'text', required: true, primary: true }",
            "{ key: 'count1', label: 'الكمية', type: 'number', min: 0, minExclusive: true }",
            "{ key: 'money1', label: 'السعر', type: 'number', required: true }",
        ]);
        const v = ruleVerdict(wrongColumn)!;
        expect(v.verdict).toBe('unmet');
    });

    it('and a digit elsewhere in the project earns nothing', () => {
        //  The literal shape of the old proof: a `min:` with a digit that has
        //  nothing to do with any column of his table.
        const decoy = `const style = { minWidth: 12 };\nconst gap = { min: 3 };\n` + schema([
            "{ key: 'text1', label: 'اسم الصنف', type: 'text', required: true, primary: true }",
            "{ key: 'money1', label: 'السعر', type: 'number', required: true }",
        ]);
        expect(ruleVerdict(decoy)!.verdict).toBe('unmet');
    });
});
