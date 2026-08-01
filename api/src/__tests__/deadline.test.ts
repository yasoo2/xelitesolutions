/**
 * Wall-clock deadlines: a hung await fails honestly instead of freezing the
 * user's screen forever — and the wiring is IN the pipeline, not just possible.
 */
import fs from 'fs';
import path from 'path';
import { withDeadline, DeadlineError, NODE_DEADLINE_MS, RUN_DEADLINE_MS } from '../shared/utils/deadline';

describe('withDeadline', () => {
    test('a promise that finishes in time passes its value through', async () => {
        await expect(withDeadline(Promise.resolve(42), 5_000, 'quick')).resolves.toBe(42);
    });

    test('a promise that rejects in time passes its ERROR through (not a deadline)', async () => {
        await expect(withDeadline(Promise.reject(new Error('real failure')), 5_000, 'x'))
            .rejects.toThrow('real failure');
    });

    test('a hung promise fails with an honest deadline_exceeded, naming the culprit', async () => {
        const hang = new Promise(() => { /* never settles — the frozen await */ });
        await expect(withDeadline(hang, 60, 'node build-7 (web_page_builder)'))
            .rejects.toThrow(/deadline_exceeded: node build-7 \(web_page_builder\) exceeded/);
    });

    test('the deadline error is typed, so callers can localize the message', async () => {
        const hang = new Promise(() => { /* never settles */ });
        await expect(withDeadline(hang, 50, 'run')).rejects.toBeInstanceOf(DeadlineError);
    });

    test('sane floors: a node gets at least 1 minute, a run at least 5', () => {
        expect(NODE_DEADLINE_MS).toBeGreaterThanOrEqual(60_000);
        expect(RUN_DEADLINE_MS).toBeGreaterThanOrEqual(5 * 60_000);
    });
});

describe('deadline wiring — the guards are actually in the pipeline', () => {
    const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');

    test('every node execution branch in the orchestrator runs under a deadline', () => {
        const src = read('orchestration/AgentOrchestrator.ts');
        expect(src).toContain("from '../shared/utils/deadline'");
        // All five NODE branches (`result = await …`, not the run-level
        // `const result = await executionFirewall…` which the RUN deadline
        // covers) go through the wrapper.
        const rawAwaits = src.match(/(?<!const )result = await (?!deadline\()/g) || [];
        expect(rawAwaits).toHaveLength(0);
        expect((src.match(/result = await deadline\(/g) || []).length).toBeGreaterThanOrEqual(5);
    });

    test('the whole run is capped in AgentLoopService, with a localized explanation', () => {
        const src = read('modules/services/AgentLoopService.ts');
        expect(src).toMatch(/withDeadline\(orchestrator\.execute\(/);
        expect(src).toContain('RUN_DEADLINE_MS');
        expect(src).toContain('DeadlineError');
        expect(src).toContain('نقطة الحفظ'); // the Arabic failure text promises the checkpoint resume
    });
});
