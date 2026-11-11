import { ProjectPlannerTool, plannerBrief, plannerPromptProfile } from '../modules/tools/definitions/ProjectPlannerTool';
import { PLANNER_TOOL_CATALOGUE, compactPlannerToolPrompt } from '../core/orchestrator/plan-tools';

/**
 * 2026-10-23: the full planning brief is ~16.6k characters, ~93% fixed text.
 * The owner's laptop reads ~6 tokens/s, so a local plan needed ~15 minutes of
 * prompt reading and never beat a planning deadline; every build fell back to
 * a stock app. A local model gets a compact brief with the same contracts.
 */
const request = 'Build an admin dashboard for a dental clinic to manage patients, appointments, treatments: add, edit, delete and search each one, with a summary page showing totals and a chart.';
const ENV = ['LOCAL_LLM_STRICT', 'LLM_PROVIDER', 'LOCAL_LLM_MODEL', 'LOCAL_LLM_BASE_URL', 'LOCAL_LLM_DISABLE'] as const;
const saved: Record<string, string | undefined> = {};

describe('a local planner gets a brief it can read', () => {
    beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
    afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

    const tool = new ProjectPlannerTool() as any;
    const compact = () => tool.createLocalCompactPlanningPrompt(request, { mode: 'greenfield', projects: [], facts: [] });
    const full = () => tool.createPlanningPrompt(request, undefined, { mode: 'greenfield', projects: [], facts: [] });

    it('is a fraction of the full brief', () => {
        expect(compact().length).toBeLessThan(full().length * 0.45);
        expect(compact().length).toBeLessThan(6500);
    });

    it('keeps every tool name the plan validator accepts', () => {
        const text = compactPlannerToolPrompt();
        for (const { tool: name } of PLANNER_TOOL_CATALOGUE) expect(text).toMatch(new RegExp(`^- ${name}(?: \{[^}]*\})?:`, 'm'));
    });

    // A measured local plan gave scaffold_full_stack, npm_manager and api_project
    // empty args (2026-10-23). The required fields come from the registry itself.
    it('names each tool\'s required arguments from its registered schema', () => {
        const text = compactPlannerToolPrompt();
        expect(text).toContain('- npm_manager {command}:');
        expect(text).toContain('- web_page_builder {request}:');
        expect(text).toContain('- scaffold_full_stack {name}:');
        expect(text).not.toMatch(/\{[^}]*\b(?:sessionId|userId|workspaceId)\b/);
    });

    it('keeps the request and the contracts a plan is validated on', () => {
        const text = compact();
        expect(text).toContain(request);
        for (const field of ['requirementsCovered', 'verificationTask', 'deliverables', 'realisticMinutes', 'ai_write_file args', 'NEVER put file contents in the plan']) {
            expect(text).toContain(field);
        }
        expect(text).toMatch(/relative paths/);
    });

    it('caps the evidence it carries', () => {
        const big = { mode: 'existing', facts: Array.from({ length: 400 }, (_, i) => ({ fact: `file-${i}.ts exists with a long description of its contents` })) };
        const text = tool.createLocalCompactPlanningPrompt(request, big);
        expect(text.length).toBeLessThan(10_000);
    });

    it('is chosen by the model that serves the call, not by the UI label', () => {
        expect(plannerPromptProfile({ modelConfig: { provider: 'auto' } })).toBe('full');
        expect(plannerPromptProfile({ modelConfig: { provider: 'local', model: 'qwen3.5:9b-joe-q4_K_M' } })).toBe('local-compact');
        expect(plannerPromptProfile({ modelConfig: { provider: 'gemini', model: 'gemini-2.5-flash' } })).toBe('full');
        process.env.LOCAL_LLM_STRICT = '1';
        process.env.LLM_PROVIDER = 'local';
        process.env.LOCAL_LLM_MODEL = 'qwen3.5:9b-joe-q4_K_M';
        expect(plannerPromptProfile({ modelConfig: { provider: 'auto' } })).toBe('local-compact');
        expect(plannerPromptProfile(undefined)).toBe('local-compact');
    });
});

/**
 * Owner, 2026-10-23: the laptop is for development; Joe runs on a GPU server.
 * Nothing is shortened to suit the laptop: a local plan gets the FULL brief
 * whenever it fits the window; the compact brief is for capacity only.
 */
describe('a local plan gets the full brief whenever it fits', () => {
    const tool = new ProjectPlannerTool() as any;
    it('the full brief is used for a local model when it fits the window', () => {
        const full = tool.createPlanningPrompt(request, undefined, { mode: 'greenfield', projects: [], facts: [] });
        expect(plannerBrief(full, true)).toBe('full');
        expect(plannerBrief(full, false)).toBe('full');
    });
    it('the compact brief only when the full one cannot fit', () => {
        const huge = 'x'.repeat(3 * 16384);
        expect(plannerBrief(huge, true)).toBe('compact');
        expect(plannerBrief(huge, false)).toBe('full');
    });
});
