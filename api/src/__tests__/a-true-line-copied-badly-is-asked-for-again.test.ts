/**
 * ⛔ A TRUE LINE, COPIED SO IT COULD NOT BE ACCEPTED, IS ASKED FOR AGAIN — ONCE.
 *
 * The 500-prompt exam, 2026-11-03, P402: a quiz game whose app.js keeps the
 * score (`score++;`, `$("score").textContent = score;`) was refused four times
 * on «R3 The app tracks the score: it was reported present and its evidence
 * is not in the source». Re-asked by hand three times over the same source,
 * the judge answered «met» with `score++;` each time: a real line, eight
 * characters, below the twelve a line needs to stand as proof. In one round
 * it also copied the last question as `{ q: "…", answer: 0 },` with a comma
 * the source does not have, and a true «10 questions» was lost too.
 */
import { foundInSource, verifyNamed } from '../core/quality/named-requirements';

const SOURCE = [
    'const QUESTIONS = [',
    '  { q: "Who typically leads the school and oversees its staff?", options: ["The Headmaster", "The head chef"], answer: 0 }',
    '];',
    'let current = 0, score = 0;',
    'function choose(i) {',
    '  const q = QUESTIONS[current];',
    '  if (i === q.answer) {',
    '    score++;',
    '  }',
    '  $("score").textContent = score;',
    '}',
    '<section id="results-screen" class="hidden"><h1>Quiz Complete!</h1></section>',
].join('\n');

const REQS = [
    { id: 'R1', text: 'The quiz has 10 questions.', quote: '10 questions' },
    { id: 'R3', text: 'The app tracks the score.', quote: 'score tracking' },
    { id: 'R4', text: 'The app has a final results screen.', quote: 'a final results screen' },
];

/** A judge that answers each call with the next reply, and keeps every prompt. */
function judge(...replies: object[]) {
    const prompts: string[] = [];
    const call = async (prompt: string) => {
        prompts.push(prompt);
        return JSON.stringify(replies[Math.min(prompts.length - 1, replies.length - 1)]);
    };
    return { call, prompts };
}

const FIRST = {
    verdicts: [
        { id: 'R1', verdict: 'met', evidence: '{ q: "Who typically leads the school and oversees its staff?", options: ["The Headmaster", "The head chef"], answer: 0 },', why: 'ten questions' },
        { id: 'R3', verdict: 'met', evidence: '    score++;', why: 'the score rises on a right answer' },
        { id: 'R4', verdict: 'met', evidence: '<section id="results-screen" class="hidden">', why: 'a results section' },
    ],
};

describe('a «met» whose line could not be accepted', () => {
    it('a separator at the end of a quote is not part of the proof', async () => {
        const { call } = judge(FIRST, { verdicts: [{ id: 'R3', verdict: 'met', evidence: 'if (i === q.answer) {\n    score++;', why: 'the score rises' }] });
        const judged = await verifyNamed(REQS, SOURCE, false, call);
        expect(judged.find(j => j.id === 'R1')?.verdict).toBe('met');
    });

    it('is asked for again once, with the reason, and a verbatim line counts', async () => {
        const { call, prompts } = judge(FIRST, { verdicts: [{ id: 'R3', verdict: 'met', evidence: 'if (i === q.answer) {\n    score++;', why: 'the score rises on a right answer' }] });
        const judged = await verifyNamed(REQS, SOURCE, false, call);
        expect(judged.map(j => [j.id, j.verdict])).toEqual([['R1', 'met'], ['R3', 'met'], ['R4', 'met']]);
        expect(prompts).toHaveLength(2);
        expect(prompts[1]).toContain('[R3] The app tracks the score.');
        expect(prompts[1]).toContain('too few to tell one feature from another');
        expect(prompts[1]).not.toContain('[R4]');
        expect(prompts[1]).toContain('score++;');
    });

    it('⛔ NEGATIVE — the same short line again is still not proof', async () => {
        const { call, prompts } = judge(FIRST, { verdicts: [{ id: 'R3', verdict: 'met', evidence: 'score++;', why: 'again' }] });
        const judged = await verifyNamed(REQS, SOURCE, false, call);
        expect(judged.find(j => j.id === 'R3')).toMatchObject({ verdict: 'unprovable' });
        expect(judged.find(j => j.id === 'R3')?.why).toContain('not in the source');
        expect(prompts).toHaveLength(2);
    });

    it('⛔ NEGATIVE — a line invented twice is refused twice', async () => {
        const invented = { verdicts: [{ id: 'R3', verdict: 'met', evidence: 'saveHighScoreToServer(score, playerName);', why: 'saved' }] };
        const { call } = judge({ verdicts: [...FIRST.verdicts.filter(v => v.id !== 'R3'), invented.verdicts[0]] }, invented);
        const judged = await verifyNamed(REQS, SOURCE, false, call);
        expect(judged.find(j => j.id === 'R3')?.verdict).toBe('unprovable');
    });

    it('⛔ NEGATIVE — a second question cannot turn a «met» into an «unmet»', async () => {
        const { call } = judge(FIRST, { verdicts: [{ id: 'R3', verdict: 'unmet', evidence: '', why: 'changed its mind' }] });
        const judged = await verifyNamed(REQS, SOURCE, false, call);
        expect(judged.find(j => j.id === 'R3')?.verdict).toBe('unprovable');
    });

    it('nothing is asked again when every line was accepted', async () => {
        const fine = { verdicts: FIRST.verdicts.map(v => v.id === 'R3' ? { ...v, evidence: '$("score").textContent = score;' } : v) };
        const { call, prompts } = judge(fine);
        const judged = await verifyNamed(REQS, SOURCE, false, call);
        expect(judged.every(j => j.verdict === 'met')).toBe(true);
        expect(prompts).toHaveLength(1);
    });

    it('⛔ NEGATIVE — a token that lives in every file still proves nothing, fenced or not', () => {
        expect(foundInSource('`score++;`', SOURCE)).toBe(false);
        expect(foundInSource('`div`', '<div class="x"></div>')).toBe(false);
        expect(foundInSource(',;', SOURCE)).toBe(false);
        expect(foundInSource('`$("score").textContent = score;`', SOURCE)).toBe(true);
    });
});
