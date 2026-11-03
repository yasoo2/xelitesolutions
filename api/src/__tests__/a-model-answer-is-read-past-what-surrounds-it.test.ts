/**
 * A model's JSON answer is read past what surrounds it — a prose list, a list
 * of one, an example, `{{` in a sentence — by every reader of one.
 *
 * Round 21 second review (W7):
 *  (a) parseModelJsonArray took the first array that parsed: «Tools I will
 *      use: ["file_write","shell_execute"]. Plan: [{"id":"s1",…}]» became two
 *      steps named after tools, with no inputs; a plan cut before its `]` came
 *      back null, against its own comment;
 *  (b) readModelJsonObject('[{"intent":…}]') was null where the greedy readers
 *      it replaced had read the object;
 *  (c) parseVerdicts took an example list before the verdicts;
 *  (d) `{{` in the prose before the answer ended the search with nothing;
 *  (e) greedy `/\{[\s\S]*\}/` readers were still in the browser runner's step
 *      planner, the browser agent, the request analyzer, the elite tools and
 *      the intent classifier.
 * Only the model calls are substituted; every reader is the real code.
 */
const mockCallLLM = jest.fn();
jest.mock('../core/llm', () => ({ ...jest.requireActual('../core/llm'), callLLM: (...args: any[]) => mockCallLLM(...args) }));

const mockRoute = jest.fn();
jest.mock('../core/llm/intelligent-router', () => {
    const actual = jest.requireActual('../core/llm/intelligent-router');
    return {
        ...actual,
        __esModule: true,
        routeToModel: (...args: any[]) => mockRoute(...args),
        default: { ...actual.default, routeToModel: (...args: any[]) => mockRoute(...args) },
    };
});

import { parseFirstJson, parseModelJsonArray, readModelJsonObject } from '../shared/utils/json';
import { parseVerdicts } from '../core/quality/named-requirements';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import adaptiveDag from '../core/orchestrator/adaptive-dag-planner';
import { planNextStep } from '../core/llm';
import { parseAction } from '../orchestration/agents/BrowserAgent';
import { classifyIntentWithLLM } from '../core/intelligence/intent-classifier';
import { RequestAnalyzerTool } from '../modules/tools/definitions/RequestAnalyzerTool';
import { BusinessLogicTool } from '../modules/tools/definitions/EliteTools';

const PROSE_THEN_PLAN = 'Tools I will use: ["file_write","shell_execute"]. Plan: [{"id":"s1","tool":"file_write","description":"write the page"}]';

describe('(a) a plan is a list of steps', () => {
    it('POSITIVE — a list of tool names in the prose is not the plan', () => {
        const plan = [{ id: 's1', tool: 'file_write', description: 'write the page' }];
        expect(parseModelJsonArray(PROSE_THEN_PLAN)).toEqual(plan);
        expect(PlanningEngine.parseJsonArrayLoose(PROSE_THEN_PLAN)).toEqual(plan);
        expect(adaptiveDag.parseJsonArrayLoose(PROSE_THEN_PLAN)).toEqual(plan);
    });

    it('POSITIVE — a plan cut at the token limit before its `]` keeps its whole steps, and says so', () => {
        const salvaged = jest.fn();
        const cut = 'Plan:\n[{"id":"s1","tool":"a"},{"id":"s2","tool":"b"},{"id":"s3","to';
        expect(parseModelJsonArray(cut, salvaged)?.map(step => step.id)).toEqual(['s1', 's2']);
        expect(salvaged).toHaveBeenCalledWith(2);
    });

    it('NEGATIVE — an empty plan is still an answer; a list of words or no list is none', () => {
        expect(parseModelJsonArray('[]')).toEqual([]);
        expect(parseModelJsonArray('Dependencies: []. Plan: [{"id":"s1"}]')).toEqual([{ id: 's1' }]);
        expect(parseModelJsonArray('["file_write","shell_execute"]')).toBeNull();
        expect(parseModelJsonArray('sorry, I cannot help with that')).toBeNull();
    });
});

describe('(b) an object handed back in a list of one', () => {
    beforeEach(() => mockRoute.mockReset());

    it('POSITIVE — is the object, for the shared reader and the router\'s request classifier', async () => {
        expect(readModelJsonObject('[{"intent":"build_page","repo":""}]')).toEqual({ intent: 'build_page', repo: '' });
        mockRoute.mockResolvedValue('[{"intent":"build_page","repo":""}]');
        expect(await PlanningEngine.classifyRequestIntent('اعمل موقع لعيادة', { hasActivePage: false })).toEqual({ intent: 'build_page', repo: '' });
    });

    it('NEGATIVE — a longer list names no single answer', () => {
        expect(readModelJsonObject('[{"intent":"a"},{"intent":"b"}]')).toBeNull();
        expect(readModelJsonObject('["build_page"]')).toBeNull();
    });
});

describe('(c) a list is the verdicts only when it speaks one', () => {
    it('POSITIVE — an example list before the verdicts is passed over', () => {
        const reply = 'Each item looks like [{"id":"r1","evidence":"…"}]. Answer: {"verdicts":[{"id":"r1","verdict":"met","evidence":"<form>","why":"shown"}]}';
        expect(parseVerdicts(reply)).toEqual([{ id: 'r1', verdict: 'met', evidence: '<form>', why: 'shown' }]);
    });

    it('NEGATIVE — a silent item inside a list that speaks is still kept, told apart from a missing one', () => {
        const reply = '{"verdicts":[{"id":"r1","met":true,"evidence":"<form>"},{"id":"r2"}]}';
        expect(parseVerdicts(reply).map(v => [v.id, v.verdict])).toEqual([['r1', 'met'], ['r2', '']]);
    });
});

describe('(d) `{{` in a sentence before the answer', () => {
    it('POSITIVE — is prose, and the answer after it is read', () => {
        expect(parseFirstJson('Write {{name}} for a field, and {{ to escape a brace. {"intent":"x"}')).toEqual({ intent: 'x' });
    });

    it('NEGATIVE — a reply cut inside its own value still offers no fragment', () => {
        expect(parseFirstJson('{"plan":{"a":1},"next":{"b":[1,2')).toBeNull();
        expect(parseFirstJson('{{"a":1')).toBeNull();
    });
});

describe('(e) the readers that were still greedy', () => {
    beforeEach(() => { mockRoute.mockReset(); mockCallLLM.mockReset(); });
    const trailing = (value: unknown) => `I will click {the button}.\n${JSON.stringify(value)}\nNote: fields look like {this}.`;

    it('the browser runner\'s step planner', async () => {
        const step = { thought: 'open the form', actions: [{ type: 'click', selector: '#book' }] };
        mockRoute.mockResolvedValue(trailing(step));
        expect(await planNextStep('book a table')).toEqual(step);
        mockRoute.mockResolvedValue('I see nothing to do.');
        expect(await planNextStep('book a table')).toEqual({ thought: 'I see nothing to do.', actions: [] });
    });

    it('the browser agent\'s action reader', () => {
        expect(parseAction(trailing({ action: 'click_at', x: 10, y: 20 }))).toEqual({ action: 'click_at', x: 10, y: 20 });
        expect(parseAction('no idea').action).toBe('ask_user');
    });

    it('the intent classifier', async () => {
        mockRoute.mockResolvedValue(trailing({ isBuild: true, isBrowser: false, isReadOnly: false, isKnowledgeQuestion: false, confidence: 0.9, reason: 'a site was asked for' }));
        const intent = await classifyIntentWithLLM('Build a site for a clinic');
        expect([intent.isBuild, intent.reason]).toEqual([true, 'a site was asked for']);
    });

    it('the request analyzer and the elite tools', async () => {
        mockCallLLM.mockResolvedValue(trailing({ projectType: 'web', complexity: 'low', modules: ['booking'] }));
        const analysis: any = await new RequestAnalyzerTool().execute({ userRequest: 'A clinic booking site' });
        expect([analysis.output.projectType, analysis.output.modules]).toEqual(['web', ['booking']]);
        mockCallLLM.mockResolvedValue(trailing({ rules: ['a booking needs a date'] }));
        expect((await new BusinessLogicTool().execute({ requirements: 'bookings need dates' }) as any).output).toEqual({ rules: ['a booking needs a date'] });
        // What the tool accepts is unchanged: braces holding no valid object are still an error.
        mockCallLLM.mockResolvedValue('{rules: nope}');
        expect((await new BusinessLogicTool().execute({ requirements: 'x' }) as any).ok).toBe(false);
    });
});
