/**
 * Every reader of a model's JSON reply reads it the same way.
 *
 * Round 21 review (be8570ba, cdcff985): parseModelJson learned that a raw line
 * break inside a JSON string means itself (P001: four authored sections, 8 to
 * 31 minutes each, refused for one), and jsonReplyCandidates learned that a
 * ```bash fence inside the plan is content. Neither reached the other readers
 * of the same kind of reply — named requirements, verdicts, the project plan,
 * both DAG planners, the intent parser, the router's classifiers, the authored
 * catalogue/copy/ui — which each kept a private «first fence, else first `{`
 * to last `}`» copy. And the shared candidates offered only the FIRST balanced
 * span, so «Here is the plan for [clinic-landing-ar]: {…}» never read the plan.
 *
 * Only the model calls are substituted; every reader is the real code.
 */
const mockCallLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...args: any[]) => mockCallLLM(...args) }));

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

import { balancedJsonSpans, jsonReplyCandidates, parseFirstJson, parseModelJsonArray } from '../shared/utils/json';
import { parseRequirements, parseVerdicts } from '../core/quality/named-requirements';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import adaptiveDag from '../core/orchestrator/adaptive-dag-planner';
import { IntentParser } from '../core/intelligence/IntentParser';
import { parseRows } from '../core/design/authored-catalogue';
import { parseCopy, parseVerdict } from '../core/design/authored-copy';
import { parseAuthored } from '../core/design/authored-ui';

const parsePlan = (response: string) => (new ProjectPlannerTool() as any).parsePlan(response);
const PLAN = { projectName: 'clinic-landing-ar', phases: [{ name: 'Page', tasks: [{ tool: 'file_write', args: { path: 'index.html', content: '<h1>عيادة</h1>' } }] }] };

describe('every balanced span in the reply is a candidate, in order', () => {
    it('reads the plan after a bracketed name in the prose (the review\'s case)', () => {
        const reply = `Here is the plan for [clinic-landing-ar]: ${JSON.stringify(PLAN)}`;
        expect(jsonReplyCandidates(reply)).toEqual(['[clinic-landing-ar]', JSON.stringify(PLAN)]);
        expect(parseFirstJson(reply)).toEqual(PLAN);
        expect(parsePlan(reply).projectName).toBe('clinic-landing-ar');
    });

    it('an apostrophe in the prose is not a string that swallows the answer', () => {
        expect(parsePlan(`Here's the plan for [Sarah's clinic]: ${JSON.stringify(PLAN)}`).phases).toHaveLength(1);
    });

    it('a bracket in the prose that never closes does not end the search', () => {
        expect(parseFirstJson('Use [ for lists, then the answer: {"a":1}')).toEqual({ a: 1 });
    });

    it('a reply cut inside its value offers no fragment of it', () => {
        const cut = '{"phases":[{"name":"A","tasks":[]},{"name":"B","tasks":[';
        expect(jsonReplyCandidates(cut)).toEqual([]);
        expect(parseFirstJson(cut)).toBeNull();
        expect(parseRequirements('{"requirements":[{"text":"a","quote":"a"},{"text":"b"')).toEqual([]);
        expect(() => parsePlan(`Sure: ${cut}`)).toThrow();
    });

    it('a value nested inside a candidate is never a candidate of its own', () => {
        expect(balancedJsonSpans('[a] {"x":{"y":1}} tail [2,3]')).toEqual(['[a]', '{"x":{"y":1}}', '[2,3]']);
        expect(jsonReplyCandidates('{"files":{"a":"b"},}')).toEqual(['{"files":{"a":"b"},}']);
    });

    it('a reply full of brackets is read once, not once per bracket — apostrophes included', () => {
        for (const prose of ['[ x ', "[ it's "]) {
            const reply = prose.repeat(20_000) + '{"a":1}';
            const started = Date.now();
            expect(parseFirstJson(reply)).toEqual({ a: 1 });
            expect(Date.now() - started).toBeLessThan(2_000);
        }
    });
});

/** A reply as a small model sends it: one raw line break in a string, and a sentence with a brace after the answer. */
const slipped = (value: unknown) => `${JSON.stringify(value).replace('\\n', '\n')}\nNote: the fields are named like {this}.`;

describe('every reader of a model JSON reply reads through the shared reader', () => {
    beforeEach(() => { mockRoute.mockReset(); mockCallLLM.mockReset(); });

    it('named requirements and their verdicts', () => {
        const reply = slipped({ requirements: [{ text: 'a booking form', quote: 'booking\nform' }] });
        expect(() => JSON.parse(reply)).toThrow();
        expect(parseRequirements(reply)).toEqual([{ text: 'a booking form', quote: 'booking\nform' }]);
        const verdicts = slipped({ verdicts: [{ id: 'r1', verdict: 'met', evidence: 'line\none', why: 'shown' }] });
        expect(parseVerdicts(verdicts)).toEqual([{ id: 'r1', verdict: 'met', evidence: 'line\none', why: 'shown' }]);
    });

    it('the project plan, with its trailing-comma retry still after it', () => {
        const plan = { phases: [{ name: 'A', tasks: [{ tool: 'file_write', args: { path: 'a.txt', content: 'one\ntwo' } }] }] };
        const reply = JSON.stringify(plan).replace('one\\ntwo', 'one\ntwo');
        expect(parsePlan(reply).phases[0].tasks[0].args.content).toBe('one\ntwo');
        expect(parsePlan(reply.replace(/\]\}$/, '],}')).phases[0].name).toBe('A');
    });

    it('both DAG planners', () => {
        const reply = '[{"id":"a","tool":"central_answer","description":"line\nbreak"},]';
        expect(PlanningEngine.parseJsonArrayLoose(reply)).toEqual([{ id: 'a', tool: 'central_answer', description: 'line\nbreak' }]);
        expect(adaptiveDag.parseJsonArrayLoose(reply)).toEqual([{ id: 'a', tool: 'central_answer', description: 'line\nbreak' }]);
        // A `}` inside a step's text no longer splits the salvage.
        const broken = '[{"id":"n1","description":"use {x} then }"},{"id":"n2","desc":"say "hi" now"}]';
        expect(parseModelJsonArray(broken)?.map(step => step.id)).toEqual(['n1']);
    });

    it('the intent parser\'s specification reader and its deep analysis', async () => {
        mockRoute.mockResolvedValue(slipped({ requirements: [{ id: 'REQ-001', description: 'line\nbreak' }] }));
        const spec = await IntentParser.parseSpecification('A clinic booking site.');
        expect(spec.requirements[0].description).toBe('line\nbreak');
        // A request no deterministic route claims reaches the model's analysis.
        mockRoute.mockReset().mockResolvedValue('{"complexity":"high","riskLevel":"critical","suggestedAgent":"Security"}\nI picked {Security}.');
        const intent: any = await IntentParser.parse('Our quarterly vendor review', IntentParser.createContext('u', 's', []));
        expect(mockRoute).toHaveBeenCalledTimes(1);
        expect([intent.complexity, intent.riskLevel, intent.suggestedAgent]).toEqual(['high', 'critical', 'Security']);
    });

    it('the router\'s request classifier', async () => {
        mockRoute.mockResolvedValue('{"intent":"build_page","repo":""}\nI chose {build_page} because a site was asked for.');
        expect(await PlanningEngine.classifyRequestIntent('اعمل موقع لعيادة', { hasActivePage: false })).toEqual({ intent: 'build_page', repo: '' });
    });

    it('the authored catalogue, copy and interface readers pass over a code fence before the answer', () => {
        const codeFirst = (value: unknown) => `Here is how it renders:\n\`\`\`jsx\nconst style = { gap: 4 };\n\`\`\`\n${JSON.stringify(value)}`;
        expect(parseRows(codeFirst({ rows: [{ name: 'تنظيف' }] }))).toEqual([{ name: 'تنظيف' }]);
        expect(parseAuthored(codeFirst({ files: { Hero: 'export default () => null;\n' } }))).toEqual({ Hero: 'export default () => null;\n' });
        expect(parseVerdict(codeFirst({ fails: { cta: 'not about this clinic' } }))).toEqual({ cta: 'not about this clinic' });
        expect(parseCopy(codeFirst({ fields: { cta: 'احجز' } }))).toEqual({ cta: 'احجز' });
        // The shape the brief asks for wins over an object met before it.
        expect(parseCopy('{} {"fields":{"cta":"احجز"}}')).toEqual({ cta: 'احجز' });
    });

    it('what each reader accepts is unchanged: broken JSON and wrong shapes stay refused', () => {
        expect(parseAuthored('{"files":{"Hero": nope\n}}')).toEqual({});
        expect(parseRows('{"rows":"not a list"}')).toEqual([]);
        expect(parseVerdict('I could not judge it.')).toBeNull();
        expect(parseVerdicts('{"note":"nothing to say"}')).toEqual([]);
        expect(() => parsePlan('{"projectName":"x"}')).toThrow(/Missing phases array/);
        expect(PlanningEngine.parseJsonArrayLoose('sorry, I cannot help with that')).toBeNull();
    });
});
