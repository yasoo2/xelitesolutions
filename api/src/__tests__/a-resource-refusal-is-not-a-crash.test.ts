/**
 * A RESOURCE REFUSAL IS NOT A CRASH.
 *
 * Eval P001-landing-ar (run-1793050584667, 2026-10-27): the phase's
 * `npm install` (shell_execute) was refused by the resource guard,
 * RESOURCE_LOW_MEMORY with available 1 023 799 296 bytes against a floor of
 * 1 073 741 824, and the terminal and the phase receipt both said
 * «internal_exception: ResourceAdmissionError: RESOURCE_LOW_MEMORY» followed by
 * ten lines of stack pointing at the guard. The tool never ran.
 *
 * The refusal below is the guard's own (a real RequestResourceManager with that
 * reading), reached through the real executeTool admission. What reaches him
 * must name the code, say it in his language with its numbers, and carry no
 * stack and no internal_exception.
 */
import { executeTool } from '../modules/services/ToolService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { requestResourceManager, RequestResourceManager } from '../core/resources/RequestResourceManager';

const P001 = 1023799296;

describe('a resource refusal is not a crash', () => {
    const saved = process.env.ENABLE_AUTH_BYPASS;
    beforeAll(() => { process.env.ENABLE_AUTH_BYPASS = 'true'; });
    afterAll(() => { if (saved === undefined) delete process.env.ENABLE_AUTH_BYPASS; else process.env.ENABLE_AUTH_BYPASS = saved; });
    afterEach(() => jest.restoreAllMocks());

    const refuseLikeP001 = () => {
        const guard = new RequestResourceManager({ sampleMemory: () => ({ freeBytes: P001, availableBytes: P001 }) });
        return jest.spyOn(requestResourceManager, 'withHeavy')
            .mockImplementation((work: any, options: any) => guard.withHeavy(work, options));
    };
    const run = (input: any, context: any) => executionFirewall.runInContext(`refusal-${Date.now()}`,
        () => executeTool('shell_execute', input, context));

    it('names the code and the numbers, in his language, without internal_exception or a stack', async () => {
        const admission = refuseLikeP001();
        const r: any = await run({ command: 'npm install', request: 'اعمل موقع تعريفي لعيادة أسنان' }, { sessionId: 'refusal-ar' });
        expect(admission).toHaveBeenCalledTimes(1);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/^RESOURCE_LOW_MEMORY: /);
        expect(r.error).toContain('الذاكرة المتاحة');
        expect(r.error).toContain(`availableBytes=${P001}`);
        expect(r.error).toContain('minFreeBytes=1073741824');
        expect(r.error).not.toMatch(/internal_exception|ResourceAdmissionError|\bat \S+ \(|RequestResourceManager\.ts/);
        expect(r.logs.join('\n')).not.toMatch(/exception=/);
    });

    it('speaks English to an English request', async () => {
        refuseLikeP001();
        const r: any = await run({ command: 'npm install', request: 'Build a landing page for a dental clinic' }, { sessionId: 'refusal-en', language: 'en' });
        expect(r.error).toMatch(/^RESOURCE_LOW_MEMORY: The heavy step could not start/);
    });

    it('still reports a real fault inside a tool as internal_exception', async () => {
        jest.spyOn(requestResourceManager, 'withHeavy').mockImplementation(async () => { throw new TypeError('tool bug'); });
        const r: any = await run({ command: 'npm install' }, { sessionId: 'real-fault' });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/^internal_exception: TypeError: tool bug/);
    });
});
