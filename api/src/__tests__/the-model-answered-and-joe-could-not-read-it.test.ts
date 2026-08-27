/**
 * THE MODEL ANSWERED. JOE COULD NOT READ IT.
 *
 * Measured by hand against a project Joe had really built, printing the raw
 * bytes instead of assuming them:
 *
 *     prompt chars = 18730 · answered in 2238ms · raw length 157
 *
 *     { "req-a": { "met": false, "evidence": "",
 *                  "why": "The source does not contain any form elements…" } }
 *
 *     --- parsed verdicts ---  []
 *
 * A correct, useful verdict in two seconds — and Joe then told the owner «the
 * model returned no verdict for this item», which was **false**. It answered;
 * the reader was deaf.
 *
 * The brief asks for `{"verdicts":[{id, verdict, …}]}`. The model returned a
 * dictionary keyed by the id, with a boolean `met` instead of a string
 * `verdict` — a perfectly reasonable shape, and arguably the natural one when
 * the question concerns a single requirement.
 *
 * ⛔ THE CLASS, for the seventh time in one day: a reader that admits one form,
 * a producer that emits another reasonable one, and nothing forcing them to
 * agree. The same defect as the second writer who never got the rule — here the
 * two parties are the brief and the model.
 *
 * ⛔ AND IT COST TWO WRONG DIAGNOSES BEFORE IT WAS MEASURED. The source was
 * bounded from 88k to 18k; five requirements were split into five calls.
 * **Neither was the cause.** Both are real improvements and neither cured what
 * it was credited with. What settled it was printing what the model actually
 * said — one probe, after four hours of reasoning in the wrong direction.
 *
 * Widening the READER admits no claim the guards would have rejected: a `met`
 * still has to carry evidence `verifyNamed` can find in the source. This is
 * about hearing the answer, never about believing it — and the negatives below
 * are what keep that line where it is.
 */

import { parseVerdicts, verifyNamed, NamedRequirement } from '../core/quality/named-requirements';

const SOURCE = `
export function Services() {
  return <ul className="service-list">{SERVICES.map(s => <li key={s.id}>{s.name}</li>)}</ul>;
}
`;

const ONE: NamedRequirement[] = [
    { id: 'req-a', text: 'a booking form', quote: 'a booking form' },
];

describe('the reader hears every shape a model really produces', () => {
    it('⛔ POSITIVE — the exact bytes the keyless mesh returned, verbatim', () => {
        //  Copied from the probe, fence and all. This is the test that would
        //  have caught it before it reached him.
        const raw = '```json\n{\n  "req-a": {\n    "met": false,\n    "evidence": "",\n'
            + '    "why": "The source does not contain any form elements or booking form components."\n  }\n}\n```';
        expect(parseVerdicts(raw)).toEqual([{
            id: 'req-a',
            verdict: 'unmet',
            evidence: '',
            why: 'The source does not contain any form elements or booking form components.',
        }]);
    });

    it('POSITIVE — the shape the brief asks for still works', () => {
        //  Widening must not cost the form that already worked.
        const raw = JSON.stringify({ verdicts: [{ id: 'req-a', verdict: 'met', evidence: 'x', why: 'y' }] });
        expect(parseVerdicts(raw)).toEqual([{ id: 'req-a', verdict: 'met', evidence: 'x', why: 'y' }]);
    });

    it('POSITIVE — a single unwrapped verdict, the natural answer to one question', () => {
        const raw = JSON.stringify({ verdict: 'unprovable', why: 'I could not tell', evidence: '' });
        expect(parseVerdicts(raw)[0]).toMatchObject({ verdict: 'unprovable', why: 'I could not tell' });
    });

    it('POSITIVE — «met: true» and «verdict: met» are the same statement', () => {
        //  A boolean is what a model reaches for when the question is
        //  yes-or-no. Refusing to understand it is not strictness, it is
        //  deafness — and it is what made Joe say the model had not answered.
        expect(parseVerdicts(JSON.stringify({ 'req-a': { met: true, evidence: 'e', why: 'w' } }))[0].verdict).toBe('met');
        expect(parseVerdicts(JSON.stringify({ 'req-a': { met: false, evidence: '', why: 'w' } }))[0].verdict).toBe('unmet');
    });

    it('POSITIVE — «reason» and «proof» are heard as «why» and «evidence»', () => {
        const raw = JSON.stringify({ 'req-a': { met: true, proof: 'the line', reason: 'because' } });
        expect(parseVerdicts(raw)[0]).toMatchObject({ evidence: 'the line', why: 'because' });
    });

    it('⛔ NEGATIVE — hearing more does NOT mean believing more', async () => {
        //  The line that must not move. A verdict the reader can now
        //  understand still has to survive `verifyNamed`: «met» with evidence
        //  that is not in the source is downgraded exactly as before. Widening
        //  a parser is where a guard gets loosened by accident.
        const judged = await verifyNamed(ONE, SOURCE, false, async () => JSON.stringify({
            'req-a': { met: true, evidence: '<form onSubmit={book}>', why: 'the booking form is there' },
        }));
        expect(judged[0].verdict).toBe('unprovable');
        expect(judged[0].why).toContain('not in the source');
    });

    it('⛔ NEGATIVE — and a real «unmet» now reaches the ledger with its reason', async () => {
        //  The whole point of the repair: this used to become «the model
        //  returned no verdict for this item», which was a false sentence
        //  about a model that had answered correctly.
        const judged = await verifyNamed(ONE, SOURCE, false, async () => JSON.stringify({
            'req-a': { met: false, evidence: '', why: 'no form elements anywhere in the build' },
        }));
        expect(judged[0]).toMatchObject({ verdict: 'unmet', why: 'no form elements anywhere in the build' });
    });

    it('NEGATIVE — prose with no JSON is still nothing, not a guess', () => {
        expect(parseVerdicts('I think it is probably fine.')).toEqual([]);
        expect(parseVerdicts('')).toEqual([]);
        //  An object that carries no verdict at all is not a verdict.
        expect(parseVerdicts(JSON.stringify({ summary: 'looks good', score: 9 }))).toEqual([]);
    });
});
