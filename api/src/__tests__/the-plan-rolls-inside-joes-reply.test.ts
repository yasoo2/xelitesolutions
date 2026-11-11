/**
 * THE PLAN ROLLS INSIDE JOE'S REPLY, AND THE REPLY UNFOLDS WORD BY WORD.
 *
 * The owner, 2026-11-02, looking at the interface: the «Agent Tasks» box
 * floated over the composer, on top of what he was typing. «احنا اتفقنا انه
 * يكون داخله جوا وليس في قائمة عائمة»: it belongs inside Joe's reply, and it
 * should move like a film's credits: each step holds its line while it runs,
 * and rolls up when it is done. And the answer should arrive word by word.
 */
import fs from 'fs';
import path from 'path';
import { creditsWindow, normalizePlan, rowFade, WINDOW_ROWS } from '../../../web/src/lib/planCredits';
import { revealDuration, revealPrefix, revealTokens, wordsAt, REVEAL_MAX_MS, REVEAL_MIN_MS } from '../../../web/src/lib/wordReveal';

const WEB = path.join(__dirname, '..', '..', '..', 'web', 'src');
const read = (...p: string[]) => fs.readFileSync(path.join(WEB, ...p), 'utf8');

const plan = (...statuses: string[]) => normalizePlan(statuses.map((status, i) => ({ id: `t${i}`, content: `step ${i}`, status })));

describe('the plan is read whatever shape the server sends it in', () => {
    it('content, label or text; empty steps dropped; an unknown status waits', () => {
        expect(normalizePlan([
            { id: 'a', content: 'Write the page', status: 'completed' },
            { id: 'b', label: 'Run it', status: 'in_progress' },
            { text: 'Check  the\nbuttons', status: 'weird' },
            { id: 'd', content: '   ' },
        ])).toEqual([
            { id: 'a', text: 'Write the page', status: 'completed' },
            { id: 'b', text: 'Run it', status: 'in_progress' },
            { id: 'p2', text: 'Check the buttons', status: 'pending' },
        ]);
        expect(normalizePlan({ todos: [{ id: 'x', content: 'one' }] })).toHaveLength(1);
        expect(normalizePlan(undefined)).toEqual([]);
    });
});

describe('the window rolls like credits', () => {
    it('the step in progress holds its line; the finished ones roll up above it', () => {
        expect(creditsWindow(plan('in_progress', 'pending', 'pending', 'pending', 'pending', 'pending'))).toMatchObject({ current: 0, offset: 0, done: 0 });
        expect(creditsWindow(plan('completed', 'completed', 'in_progress', 'pending', 'pending', 'pending'))).toMatchObject({ current: 2, offset: 0 });
        //  One more step done: the list moves up one line.
        expect(creditsWindow(plan('completed', 'completed', 'completed', 'in_progress', 'pending', 'pending'))).toMatchObject({ current: 3, offset: 1, done: 3 });
        expect(creditsWindow(plan('completed', 'completed', 'completed', 'completed', 'in_progress', 'pending'))).toMatchObject({ current: 4, offset: 2 });
    });

    it('between two steps, the next one waiting takes the line', () => {
        expect(creditsWindow(plan('completed', 'pending', 'pending'))).toMatchObject({ current: 1 });
    });

    it('when every step is done the last ones stay in view, all bright', () => {
        const win = creditsWindow(plan('completed', 'completed', 'completed', 'completed', 'completed', 'cancelled'));
        expect(win).toMatchObject({ allDone: true, done: 6, total: 6, offset: 6 - WINDOW_ROWS });
        expect(rowFade(0, win)).toBe(1);
    });

    it('the line in progress is brightest; finished ones fade as they rise; only the next one shows below', () => {
        const win = creditsWindow(plan('completed', 'completed', 'completed', 'in_progress', 'pending', 'pending'));
        expect(rowFade(3, win)).toBe(1);
        expect(rowFade(2, win)).toBeGreaterThan(rowFade(1, win));
        expect(rowFade(4, win)).toBeGreaterThan(0);
        expect(rowFade(5, win)).toBe(0);
    });
});

describe('the reply unfolds word by word, and ends exactly as it was written', () => {
    const text = 'Done.\n\nThe page has **three** buttons:\n- plus\n- minus  \n- reset';

    it('the words joined back are the text, spaces and line breaks included', () => {
        const tokens = revealTokens(text);
        expect(tokens.join('')).toBe(text);
        expect(revealPrefix(tokens, 2)).toBe('Done.\n\nThe ');
        expect(revealTokens('  leading space kept').join('')).toBe('  leading space kept');
    });

    it('it grows step by step and is whole when the time is up', () => {
        const words = revealTokens(text).length;
        const total = revealDuration(words);
        expect(wordsAt(0, words)).toBe(1);
        expect(wordsAt(total / 2, words)).toBeGreaterThan(1);
        expect(wordsAt(total / 2, words)).toBeLessThan(words);
        expect(wordsAt(total, words)).toBe(words);
    });

    it('short replies read at a natural pace, long ones never take more than a few seconds', () => {
        expect(revealDuration(3)).toBe(REVEAL_MIN_MS);
        expect(revealDuration(5000)).toBe(REVEAL_MAX_MS);
    });
});

describe('the interface puts them where the owner asked', () => {
    it('nothing floats over the composer: the task list is gone from it', () => {
        const composer = read('components', 'CommandComposer.tsx');
        expect(composer).not.toMatch(/<TodosPanel/);
        const chat = read('components', 'ChatPanel.tsx');
        expect(chat).not.toMatch(/<TodosPanel/);
    });

    it('the live reply carries the plan, and the finished reply keeps it, sealed with the run', () => {
        const chat = read('components', 'ChatPanel.tsx');
        const live = chat.slice(chat.indexOf('joe-live-dock'), chat.indexOf('<ScreenshotResults'));
        expect(live).toMatch(/<NeuralThinkingIndicator[\s\S]*<PlanCredits sessionId=\{sessionId\} \/>/);
        expect(chat).toMatch(/<PlanCredits mode="final" plan=\{traceFor\.get\(msg\.id\)!\.plan\} \/>/);
        expect(read('services', 'socket.ts')).toMatch(/const plan = normalizePlan\(state\.taskTrackerData\);[\s\S]{0,400}\.\.\.\(plan\.length \? \{ plan \} : \{\}\)/);
    });

    it('a reply arriving while the user watches unfolds; history appears whole', () => {
        const chat = read('components', 'ChatPanel.tsx');
        //  Decided while drawing (an effect drew the whole reply first), by the text (the id changes when it is saved).
        expect(chat).toMatch(/<WordReveal[\s\S]{0,200}animate=\{shouldReveal\(msg\)\}/);
        expect(chat).not.toMatch(/animate=\{revealIds\.has\(msg\.id\)\}/);
        expect(chat).toMatch(/if \(!revealRef\.current\.baseline && messages\.length\) \{\s*revealRef\.current\.baseline = new Set\(messages\.map\(m => `\$\{m\.role\}:\$\{m\.content\}`\)\)/);
        expect(chat).toMatch(/return !Number\.isFinite\(at\) \|\| at >= r\.since - 5_000;/);
    });

    it('the credits move with CSS, and stay still for anyone who asked for less motion', () => {
        const credits = read('components', 'PlanCredits.tsx');
        expect(credits).toMatch(/\.pc-reel\{transition:transform/);
        expect(credits).toMatch(/prefers-reduced-motion: reduce/);
        expect(read('components', 'WordReveal.tsx')).toMatch(/prefers-reduced-motion: reduce/);
    });
});
