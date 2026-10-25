/**
 * A fence inside the answer's strings is content, not the answer's wrapper.
 *
 * From his own run (P001-landing-ar, run-1792964801290): qwen3.5 spent 31 min
 * on a 7800-char plan that opened with `{` and closed with `}`. One task wrote
 * a README holding a ```bash block; parsePlan took the first fence anywhere in
 * the reply as the answer, JSON.parse refused «bash\ncd c…», and the plan was
 * thrown away for a second planning turn.
 */
const mockCallLLM = jest.fn();

jest.mock('../core/llm', () => ({
    callLLM: (...args: any[]) => mockCallLLM(...args),
}));

import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { jsonReplyCandidates, parseFirstJson } from '../shared/utils/json';

const README = '# عيادة الابتسامة\n\n## التشغيل\n\n```bash\ncd clinic-landing-ar\nnpm install\nnpm run dev\n```\n';

const planWithReadme = () => ({
    projectName: 'clinic-landing-ar',
    totalPhases: 1,
    phases: [{
        name: 'Docs',
        description: 'Setup notes',
        tasks: [{ tool: 'file_write', task: 'README', args: { path: 'README.md', content: README } }],
    }],
});

const parsePlan = (response: string) => (new ProjectPlannerTool() as any).parsePlan(response);

describe('a fence inside the plan is content, not the answer', () => {
    it('reads a bare JSON plan whose README holds a ```bash block (the P001 reply)', () => {
        const plan = parsePlan(JSON.stringify(planWithReadme(), null, 2));
        expect(plan.phases).toHaveLength(1);
        expect(plan.phases[0].tasks[0].args.content).toBe(README);
    });

    it('reads a ```json-fenced plan whose strings hold fences of their own', () => {
        const reply = 'Here is the plan:\n```json\n' + JSON.stringify(planWithReadme(), null, 2) + '\n```\nDone.';
        expect(parsePlan(reply).phases[0].tasks[0].args.content).toBe(README);
    });

    it('still reads a plan wrapped in prose and a plain fence', () => {
        const reply = 'Plan {draft}:\n```\n{"phases":[{"name":"A","tasks":[]}]}\n```';
        expect(parsePlan(reply).phases[0].name).toBe('A');
    });

    it('never edits a valid plan\'s strings with the trailing-comma repair', () => {
        const plan = { phases: [{ name: 'A', tasks: [{ tool: 'file_write', args: { path: 'a.js', content: 'const xs = [1, 2, ];\nf(a, )' } }] }] };
        expect(parsePlan(JSON.stringify(plan)).phases[0].tasks[0].args.content).toBe('const xs = [1, 2, ];\nf(a, )');
    });

    it('still repairs a trailing comma when the plan needs it', () => {
        expect(parsePlan('{"phases":[{"name":"A","tasks":[],},],}').phases[0].name).toBe('A');
    });

    it('refuses a reply with no plan in it', () => {
        expect(() => parsePlan('I could not make a plan.')).toThrow();
        expect(() => parsePlan('{"projectName":"x"}')).toThrow(/Missing phases array/);
    });

    it('parseFirstJson returns the whole answer, not an example quoted inside it', () => {
        // An example that parses on its own (quotes inside a JSON string are
        // escaped, so only a quote-free one like [] can) must not win.
        const answer = { intent: 'build', note: 'An empty list is written:\n```json\n[]\n```' };
        expect(parseFirstJson(JSON.stringify(answer))).toEqual(answer);
        expect(parseFirstJson('Sure.\n```json\n{"ok":true}\n```')).toEqual({ ok: true });
        expect(jsonReplyCandidates('```bash\nnpm i\n```\n{"a":1}')).toEqual(['{"a":1}']);
    });

    it('the planner keeps the first plan instead of asking for another', async () => {
        mockCallLLM.mockReset();
        mockCallLLM.mockResolvedValue(JSON.stringify({
            projectName: 'clinic-landing-ar',
            totalPhases: 1,
            phases: [{
                name: 'Build the landing page',
                description: 'Static Arabic RTL page',
                tasks: [
                    { tool: 'file_write', task: 'Write the page', args: { path: 'index.html', content: '<!doctype html><html dir="rtl"><body><h1>عيادة</h1></body></html>' } },
                    { tool: 'file_write', task: 'README', args: { path: 'README.md', content: README } },
                ],
            }],
        }));
        const result: any = await new ProjectPlannerTool().execute({ projectDescription: 'اعمل صفحة تعريفية بسيطة لعيادة أسنان' }, {});
        expect(result.logs.join('\n')).not.toMatch(/not executable JSON/);
        expect(mockCallLLM).toHaveBeenCalledTimes(1);
    });
});
