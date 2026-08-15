import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { inputForTool } from '../core/orchestrator/toolCatalog';
import { tools } from '../modules/tools/registry';

describe('semantic tool argument contracts', () => {
    const searchText = (tools as any[]).find(tool => tool.name === 'search_text');

    it('derives query for search_text when the planner omitted both aliases', () => {
        const input = inputForTool(searchText, 'ابحث عن providerTimeoutMs داخل ملفات المشروع');

        expect(input).not.toBeNull();
        expect(input?.query).toContain('providerTimeoutMs');
        expect(input?.pattern).toBeUndefined();
    });

    it('keeps a valid pattern alias instead of overwriting it with the goal', () => {
        const steps: any[] = [{
            id: 'search-existing-pattern',
            tool: 'search_text',
            description: 'ابحث عن عقد المهلة',
            input: { pattern: 'providerTimeoutMs' },
        }];

        const result = PlanningEngine.fillRequiredArgs(steps, 'ابحث عن أي أثر لعقد المهلة');

        expect(result[0].tool).toBe('search_text');
        expect(result[0].input.pattern).toBe('providerTimeoutMs');
        expect(result[0].input.query).toBeUndefined();
    });

    it('repairs a missing search query before execution', () => {
        const steps: any[] = [{
            id: 'search-missing-query',
            tool: 'search_text',
            description: 'ابحث عن providerTimeoutMs داخل ملفات المشروع',
            input: {},
        }];

        const result = PlanningEngine.fillRequiredArgs(steps, 'ابحث عن providerTimeoutMs داخل ملفات المشروع');

        expect(result[0].tool).toBe('search_text');
        expect(result[0].input.query).toContain('providerTimeoutMs');
    });

    it('asks honestly when neither search alias can be derived', () => {
        const steps: any[] = [{
            id: 'search-no-query',
            tool: 'search_text',
            description: '',
            input: {},
        }];

        const result = PlanningEngine.fillRequiredArgs(steps, '');

        expect(result[0].tool).toBe('central_answer');
        expect(result[0].input.question).toContain('query أو pattern');
    });
});

afterAll(() => {
    jest.restoreAllMocks();
});

