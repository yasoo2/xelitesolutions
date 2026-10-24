import fs from 'fs';
import path from 'path';
import { RequestResourceManager } from '../core/resources/RequestResourceManager';
import { askWithin, askForTheContract } from '../modules/tools/model-call-race';
import { namedRequirements } from '../core/quality/named-requirements';
import { acceptanceBlocksDelivery, deliveryErrorForUnreadRequest } from '../modules/tools/definitions/ReactProjectTool';

/**
 * Eval round 15, 2026-10-24 (P051 156.8 min, P251 106.1 min): react_project
 * raced each model call against a 12 s timer and never told the losing call,
 * so it stayed in the local inference lane and in the build's heavy lease —
 * the tool returned 149 and 98 minutes after its verdict, and the calls ended
 * as RESOURCE_CANCELLED. The same 12 s leash, counted from the queue, made
 * every named requirement «unprovable» on a CPU model that needs minutes per
 * call. And in P101 an unread request produced ZERO criteria, which the gate
 * read as nothing to block: a stock API was delivered green.
 */
const GiB = 1024 ** 3;
const reading = () => ({ totalBytes: 16 * GiB, freeBytes: 8 * GiB, availableBytes: 8 * GiB, rssBytes: 1 });
const LOCAL = { modelConfig: { provider: 'local', model: 'qwen3.5:9b', baseUrl: 'http://127.0.0.1:11434/v1' } };
const CLOUD = { modelConfig: { provider: 'anthropic', model: 'claude-sonnet-5-5' } };

describe('a model call that loses its race is stopped', () => {
    afterEach(() => jest.useRealTimers());

    it('the build\'s heavy lease settles right after the leash fires, instead of waiting on the abandoned calls', async () => {
        jest.useFakeTimers();
        const manager = new RequestResourceManager({ sampleMemory: reading });
        // A model call shaped like the real chain: it holds an inference lease
        // and ends only when its signal is aborted (it never answers).
        const neverAnswers = (callContext: any) => manager.withInference(budget => new Promise<string>((_, reject) => {
            budget.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        }), { signal: callContext?.signal, promptEstimatedTokens: 100, requestedOutputTokens: 100 });
        const outcomes: string[] = [];
        let settled = false;
        const build = manager.withHeavy(async () => {
            // Two optional calls at once: one admitted, one queued behind it.
            const asks = [askWithin(neverAnswers, {}, 12_000), askWithin(neverAnswers, {}, 12_000)]
                .map(ask => ask.then(() => 'answered', (e: Error) => e.message));
            outcomes.push(...await Promise.all(asks));
            return 'built';
        });
        build.then(() => { settled = true; }, () => { settled = true; });
        await jest.advanceTimersByTimeAsync(12_000);
        await jest.advanceTimersByTimeAsync(1_000);
        expect(settled).toBe(true);
        await expect(build).resolves.toBe('built');
        expect(outcomes).toEqual(['the model did not answer in time', 'the model did not answer in time']);
        expect(manager.status().inference).toEqual({ active: 0, queued: 0 });
    });

    it('the run\'s own signal still reaches the call, and the run\'s context keeps the router\'s budgets', async () => {
        const run = new AbortController();
        const context: any = { signal: run.signal, modelConfig: CLOUD.modelConfig };
        let seen: any;
        const pending = askWithin(async (callContext: any) => {
            seen = callContext;
            callContext.deadBrainRecoveryAttempted = true;
            return new Promise<string>((_, reject) => callContext.signal.addEventListener('abort', () => reject(new Error('stopped by the run')), { once: true }));
        }, context, 60_000);
        run.abort();
        await expect(pending).rejects.toThrow('stopped by the run');
        expect(seen.modelConfig).toBe(CLOUD.modelConfig);
        expect({ ...seen }.signal).toBe(seen.signal);
        expect(context.deadBrainRecoveryAttempted).toBe(true);
    });
});

describe('the contract calls are not on a leash when the local model serves them', () => {
    afterEach(() => jest.useRealTimers());
    const slowModel = (answer: string, ms: number) => (callContext: any) => new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => resolve(answer), ms);
        callContext?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
    });

    it('a local model that needs 25 minutes is read, not marked unreachable', async () => {
        jest.useFakeTimers();
        const answer = JSON.stringify({ requirements: [{ text: 'a booking form', quote: 'a booking form' }] });
        const reading = namedRequirements('Build a clinic site with a booking form', false,
            prompt => askForTheContract(slowModel(answer, 25 * 60_000), LOCAL, 12_000));
        await jest.advanceTimersByTimeAsync(2 * 25 * 60_000);
        const read = await reading;
        expect(read.passes).toBe(2);
        expect(read.requirements.map(r => r.text)).toEqual(['a booking form']);
        expect(read.rejected.filter(r => r.text === '*')).toEqual([]);
    });

    it('on another provider the leash stays, and the call it abandons is aborted', async () => {
        jest.useFakeTimers();
        let aborted = false;
        const call = (callContext: any) => {
            callContext.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
            return slowModel('late', 25 * 60_000)(callContext);
        };
        const pending = askForTheContract(call, CLOUD, 12_000);
        const outcome = expect(pending).rejects.toThrow('the model did not answer in time');
        await jest.advanceTimersByTimeAsync(12_000);
        await outcome;
        expect(aborted).toBe(true);
    });
});

describe('an unread request is not a pass', () => {
    const base = { criteria: 0, accepted: true, unprovable: 0, named: 0, judgeWasBlind: false, requestUnread: false };

    it('zero criteria because nothing was read blocks delivery; zero because nothing judgeable was named does not', () => {
        expect(acceptanceBlocksDelivery({ ...base, requestUnread: true })).toBe(true);
        expect(acceptanceBlocksDelivery(base)).toBe(false);
    });
    it('a catalogue verdict over an unread request is diagnostic only', () => {
        expect(acceptanceBlocksDelivery({ ...base, criteria: 3, requestUnread: true })).toBe(true);
        expect(acceptanceBlocksDelivery({ ...base, criteria: 3 })).toBe(false);
    });
    it('the existing rules are unchanged', () => {
        expect(acceptanceBlocksDelivery({ ...base, criteria: 2, accepted: false })).toBe(true);
        expect(acceptanceBlocksDelivery({ ...base, criteria: 2, named: 2, unprovable: 1 })).toBe(true);
        expect(acceptanceBlocksDelivery({ ...base, criteria: 2, named: 2, judgeWasBlind: true })).toBe(true);
        expect(acceptanceBlocksDelivery({ ...base, criteria: 2, named: 2 })).toBe(false);
    });
    it('the error names the cause, and is not a criteria failure the repair loop would try to rewrite', () => {
        const error = deliveryErrorForUnreadRequest('the model could not be reached: TIMEOUT');
        expect(error).toBe('acceptance_unverified: request_not_read — the model could not be reached: TIMEOUT');
        expect(error).not.toMatch(/acceptance_criteria_unmet/);
    });
});

describe('the wiring in react_project', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');

    it('no model call is raced without being stopped', () => {
        expect(source).not.toMatch(/Promise\.race\(\[\s*routeToModel\(/);
        expect((source.match(/askWithin\(\(context: any\) => routeToModel\(/g) || []).length).toBe(3);
    });
    it('reading and judging go through the contract asker', () => {
        expect(source).toMatch(/const askTheModel = async \(prompt: string\): Promise<string> => \{\s*const \{ routeToModel \} = require\([^)]*\);\s*return askForTheContract\(/);
        expect(source).toContain('await namedRequirements(request, isAr, askTheModel)');
        expect(source).toContain('await verifyNamed(namedByHim, projectEvidence, isAr, askTheModel,');
    });
    it('the reader\'s outcome reaches the gate', () => {
        expect(source).toContain('requestUnread = !readerAnswered && !namedByHim.length;');
        expect(source).toMatch(/const acceptanceBlocked = acceptanceBlocksDelivery\(\{[\s\S]{0,260}requestUnread,\s*\}\);/);
        expect(source).toMatch(/requestUnread\s*\?\s*deliveryErrorForUnreadRequest\(whyNotRead\)/);
    });
});
