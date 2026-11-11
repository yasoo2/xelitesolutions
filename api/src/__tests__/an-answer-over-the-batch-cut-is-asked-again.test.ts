/**
 * AN ANSWER GIVEN OVER THE BATCH'S CUT IS NOT THE LAST WORD.
 *
 * Eval P051 (dental admin, run-1793014978892): ten requirements, 136962 chars
 * of source. The one batch call was shown 40007 chars of windows filled in
 * source order; the summary page's JSX sat past them, and the judge said so
 * («the JSX rendering code … is cut off»). That «unprovable» was taken as the
 * verdict, the per-requirement road never ran, and delivery was blocked on «a
 * summary page showing totals, a chart» — while the slice chosen for that
 * requirement alone carried the chart.
 */

import { verifyNamed, NamedRequirement, MAX_SOURCE_CHARS } from '../core/quality/named-requirements';

const CHART_LINE = 'function SundialWidget() { return <div className="sundial-widget">sundial</div>; }';
const LEDGER_LINE = 'const patientsLedgerRow1 = "patients ledger row 1";';

/** The first requirement's words everywhere at the head; the second's only at the end. */
function bigSource(): string {
    const rows: string[] = [];
    for (let i = 0; rows.join('\n').length < MAX_SOURCE_CHARS * 2; i++) {
        rows.push(`const patientsLedgerRow${i} = "patients ledger row ${i}";`);
    }
    return rows.join('\n') + '\n' + CHART_LINE + '\n';
}

const reqs: NamedRequirement[] = [
    { id: 'req-ledger', text: 'a ledger of patients', quote: 'a ledger of patients' },
    { id: 'req-sundial', text: 'a sundial widget', quote: 'a sundial widget' },
];

/** A judge that rules only on what it was shown, and says «unprovable» otherwise. */
function honestJudge(prompts: string[]) {
    return async (prompt: string): Promise<string> => {
        prompts.push(prompt);
        const verdicts = reqs.filter(r => prompt.includes(`[${r.id}]`)).map(r => {
            const line = r.id === 'req-sundial' ? CHART_LINE : LEDGER_LINE;
            return prompt.includes(line)
                ? { id: r.id, verdict: 'met', evidence: line, why: 'shown' }
                : { id: r.id, verdict: 'unprovable', evidence: '', why: 'the part I need is cut off' };
        });
        return JSON.stringify({ verdicts });
    };
}

describe('an answer over the batch cut is asked again over the requirement\'s own slice', () => {
    it('proves a requirement whose code the batch slice cut away', async () => {
        const prompts: string[] = [];
        const judged = await verifyNamed(reqs, bigSource(), false, honestJudge(prompts));
        expect(prompts[0]).not.toContain(CHART_LINE);
        const sundial = judged.find(j => j.id === 'req-sundial')!;
        expect(sundial.verdict).toBe('met');
        expect(judged.find(j => j.id === 'req-ledger')!.verdict).toBe('met');
        // the ledger was proven by the batch, so only the sundial was asked again
        expect(prompts).toHaveLength(2);
        expect(prompts[1]).toContain('[req-sundial]');
        expect(prompts[1]).not.toContain('[req-ledger]');
    });

    it('keeps the batch answer when the re-ask returns nothing readable', async () => {
        let calls = 0;
        const judged = await verifyNamed(reqs, bigSource(), false, async (prompt: string) => {
            calls++;
            if (calls > 1) return 'I cannot answer that.';
            return JSON.stringify({ verdicts: [
                { id: 'req-ledger', verdict: 'met', evidence: LEDGER_LINE, why: 'shown' },
                { id: 'req-sundial', verdict: 'unprovable', evidence: '', why: 'batch could not tell' },
            ] });
        });
        expect(calls).toBe(2);
        const sundial = judged.find(j => j.id === 'req-sundial')!;
        expect(sundial.verdict).toBe('unprovable');
        expect(sundial.why).toBe('batch could not tell');
    });

    it('does not ask again when the batch was shown the whole source', async () => {
        const prompts: string[] = [];
        const small = LEDGER_LINE + '\n' + 'const other = 1;\n';
        const judged = await verifyNamed(reqs, small, false, honestJudge(prompts));
        expect(prompts).toHaveLength(1);
        expect(judged.find(j => j.id === 'req-sundial')!.verdict).toBe('unprovable');
    });
});
