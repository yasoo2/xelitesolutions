import fs from 'fs';
import path from 'path';
import { askToAuthor } from '../modules/tools/model-call-race';
import { askForCss } from '../core/quality/model-round';

jest.mock('../core/llm/intelligent-router', () => ({ routeToModel: jest.fn() }));
const { routeToModel } = require('../core/llm/intelligent-router');

/**
 * Eval 2026-10-25, P001-landing-ar on the current branch: react_project asked
 * qwen3.5 for his clinic's copy and cancelled the call 12 s after the model
 * started on it — «refused *: the model could not be reached: the model did not
 * answer in time». That one leash loss marked the model unavailable, so
 * «interface authoring stood down» too and the page shipped in derived words.
 * The planner call minutes earlier had needed 25 min: the leash measured the
 * clock, not the model. The same fixed leash held the catalogue rows, the
 * authored sections (30 s for all of them) and the CSS / handler repair rounds,
 * whose timer only resolved '' and left the losing call running.
 */
const LOCAL = { modelConfig: { provider: 'local', model: 'qwen3.5:9b', baseUrl: 'http://127.0.0.1:11434/v1' } };
const CLOUD = { modelConfig: { provider: 'anthropic', model: 'claude-sonnet-5-5' } };
const SLOW = 25 * 60_000;

/** Answers after `ms`, or rejects when its signal is aborted. */
const slowModel = (answer: string, ms: number, seen: { aborted?: boolean } = {}) => (...args: any[]) => {
    const callContext = args[7];
    return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => resolve(answer), ms);
        callContext?.signal?.addEventListener('abort', () => {
            seen.aborted = true; clearTimeout(timer); reject(new Error('aborted'));
        }, { once: true });
    });
};

describe('a call that writes his build is not raced against a fixed clock on the local model', () => {
    afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });

    it('copy the local model needs 25 minutes to write is kept, not refused at 12 s', async () => {
        jest.useFakeTimers();
        const pending = askToAuthor((context: any) => slowModel('his copy', SLOW)(0, 0, 0, 0, 0, 0, 0, context), LOCAL, 12_000);
        let outcome = 'pending';
        pending.then(v => { outcome = v; }, (e: Error) => { outcome = e.message; });
        await jest.advanceTimersByTimeAsync(12_000);
        expect(outcome).toBe('pending');
        await jest.advanceTimersByTimeAsync(SLOW);
        expect(outcome).toBe('his copy');
    });

    it('the run\'s own signal still stops a local authoring call', async () => {
        const run = new AbortController();
        const seen: { aborted?: boolean } = {};
        const pending = askToAuthor((context: any) => slowModel('late', SLOW, seen)(0, 0, 0, 0, 0, 0, 0, context),
            { ...LOCAL, signal: run.signal }, 12_000);
        run.abort();
        await expect(pending).rejects.toThrow('aborted');
        expect(seen.aborted).toBe(true);
    });

    it('on another provider the leash stays, names its reason, and aborts the call it abandons', async () => {
        jest.useFakeTimers();
        const seen: { aborted?: boolean } = {};
        const pending = askToAuthor((context: any) => slowModel('late', SLOW, seen)(0, 0, 0, 0, 0, 0, 0, context),
            CLOUD, 20_000, 'the interface authoring time budget was used');
        const outcome = expect(pending).rejects.toThrow('the interface authoring time budget was used');
        await jest.advanceTimersByTimeAsync(20_000);
        await outcome;
        expect(seen.aborted).toBe(true);
    });
});

describe('the CSS repair round follows the same rule', () => {
    afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });
    const finding = [{ id: 'small_targets', evidence: [{ sel: 'button.save', w: 20, h: 20 }] }];
    const css = 'button.save { min-height: 44px; padding: 8px; }';

    it('a local answer after 10 minutes is the one written, and it is asked with his provider', async () => {
        jest.useFakeTimers();
        routeToModel.mockImplementation(slowModel(css, 10 * 60_000));
        const pending = askForCss(finding, { timeoutMs: 45_000, context: LOCAL });
        await jest.advanceTimersByTimeAsync(10 * 60_000);
        await expect(pending).resolves.toEqual({ css });
        expect(routeToModel.mock.calls[0][7].modelConfig).toBe(LOCAL.modelConfig);
        expect(routeToModel.mock.calls[0][7].purpose).toBe('internal');
    });

    it('on another provider the 45 s leash stops the call instead of leaving it in the lane', async () => {
        jest.useFakeTimers();
        const seen: { aborted?: boolean } = {};
        routeToModel.mockImplementation(slowModel(css, 10 * 60_000, seen));
        const pending = askForCss(finding, { timeoutMs: 45_000, context: CLOUD });
        await jest.advanceTimersByTimeAsync(45_000);
        await expect(pending).resolves.toEqual({ css: '', why: 'the model did not answer in time' });
        expect(seen.aborted).toBe(true);
    });
});

describe('every authoring call in react_project goes through that rule', () => {
    const REACT = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

    it('copy, catalogue and interface authoring use askToAuthor, and no bare leash is left', () => {
        for (const author of ['authorCopy({', 'authorCatalogue({', 'authorComponents(']) {
            const at = REACT.indexOf(author);
            expect(at).toBeGreaterThan(-1);
            expect(REACT.slice(at, at + 4000)).toMatch(/askToAuthor\(\(context: any\) => routeToModel\(/);
        }
        expect(REACT).not.toMatch(/\baskWithin\(/);
    });

    it('the 30 s interface budget is a remote provider\'s, not the local model\'s', () => {
        expect(REACT).toContain('const authoredLocally = servedByLocalModel(context);');
        expect(REACT).toContain("if (remaining <= 0 && !authoredLocally) throw new Error('the interface authoring time budget was used');");
    });

    it('the CSS round is asked with the run\'s context, so it reaches the provider he chose', () => {
        expect(REACT).toContain('await askForCss(rich, { timeoutMs: 45_000, context });');
    });
});
