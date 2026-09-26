import { capabilityRoute, selectToolsFor } from '../core/orchestrator/toolCatalog';
import {
    capabilityRouteAsync,
    catalogueForAsync,
    clearRerankCache,
    needsRerank,
    parseRanking,
    selectToolsForAsync,
} from '../core/orchestrator/tool-rerank';

const HEALTH_GOAL = 'give me a rundown of this repository health';
const SEO_GOAL = 'check whether my site is easy for search engines to find';
const TRANSLATE_GOAL = 'translate my landing page into Arabic';
const OCR_GOAL = 'اختر أقل إعداد لأداة OCR تعمل دون إنترنت';

function countingFake(responses: Array<string | Error>): { call: (prompt: string) => Promise<string>; calls: string[] } {
    const calls: string[] = [];
    let index = 0;
    const call = async (prompt: string): Promise<string> => {
        calls.push(prompt);
        const response = responses[Math.min(index++, responses.length - 1)];
        if (response instanceof Error) throw response;
        return response;
    };
    return { call, calls };
}

describe('tool-selection-rerank', () => {
    const savedRerank = process.env.JOE_TOOL_RERANK;
    beforeEach(() => {
        clearRerankCache();
        delete process.env.JOE_TOOL_RERANK;
    });
    afterAll(() => {
        if (savedRerank === undefined) delete process.env.JOE_TOOL_RERANK;
        else process.env.JOE_TOOL_RERANK = savedRerank;
    });

    describe('tier 2: reorder on ambiguity', () => {
        it('promotes the semantically right candidate without changing the set', async () => {
            const sync = selectToolsFor(HEALTH_GOAL, 12);
            expect(sync[0]?.name).not.toBe('github_repo_manager');
            expect(sync.map(s => s.name)).toContain('github_repo_manager');

            const fake = countingFake(['{"ranking":["github_repo_manager","git_local_workflow"],"confidence":0.9}']);
            const reranked = await selectToolsForAsync(HEALTH_GOAL, 12, { llmCall: fake.call });
            expect(reranked[0]?.name).toBe('github_repo_manager');
            expect([...reranked.map(s => s.name)].sort()).toEqual([...sync.map(s => s.name)].sort());
            expect(fake.calls).toHaveLength(1);
        });

        it.each([
            ['throws', new Error('provider down')],
            ['garbage', 'not json at all'],
            ['unknown names only', '{"ranking":["nope_not_a_tool"],"confidence":0.99}'],
            ['low confidence', '{"ranking":["github_repo_manager"],"confidence":0.2}'],
        ])('falls back to the deterministic order when the model %s', async (_label, response) => {
            const sync = selectToolsFor(HEALTH_GOAL, 12);
            const fake = countingFake([response as string | Error]);
            const reranked = await selectToolsForAsync(HEALTH_GOAL, 12, { llmCall: fake.call });
            expect(reranked.map(s => s.name)).toEqual(sync.map(s => s.name));
        });

        it('skips the model entirely for a decisive deterministic winner', async () => {
            // 'decide_capability_route' intent scores far above everything else.
            const fake = countingFake(['{"ranking":["decide_capability_route"],"confidence":0.99}']);
            const reranked = await selectToolsForAsync(OCR_GOAL, 12, { llmCall: fake.call });
            expect(fake.calls).toHaveLength(0);
            expect(reranked.map(s => s.name)).toEqual(selectToolsFor(OCR_GOAL, 12).map(s => s.name));
        });

        it('caches a successful ranking per goal', async () => {
            const fake = countingFake(['{"ranking":["github_repo_manager"],"confidence":0.9}']);
            await selectToolsForAsync(HEALTH_GOAL, 12, { llmCall: fake.call });
            await selectToolsForAsync(HEALTH_GOAL, 12, { llmCall: fake.call });
            expect(fake.calls).toHaveLength(1);
            clearRerankCache();
            await selectToolsForAsync(HEALTH_GOAL, 12, { llmCall: fake.call });
            expect(fake.calls).toHaveLength(2);
        });
    });

    describe('tier 3: retrieval on near-zero signal', () => {
        it('applies the model order above the confidence threshold', async () => {
            const sync = selectToolsFor(TRANSLATE_GOAL, 12);
            expect(sync[0]?.name).toBe('browser_translate');

            const fake = countingFake(['{"ranking":["deploy_pages","browser_translate"],"confidence":0.85}']);
            const reranked = await selectToolsForAsync(TRANSLATE_GOAL, 12, { llmCall: fake.call });
            expect(reranked.slice(0, 2).map(s => s.name)).toEqual(['deploy_pages', 'browser_translate']);
            expect(fake.calls).toHaveLength(1);
        });

        it('retrieves from the full registry on a zero-signal goal', async () => {
            const goal = 'flibbertigibbet supernova';
            const sync = selectToolsFor(goal, 12);
            expect(sync.every(s => s.score === 0)).toBe(true);

            const fake = countingFake(['{"ranking":["dead_code_detector"],"confidence":0.8}']);
            const reranked = await selectToolsForAsync(goal, 12, { llmCall: fake.call });
            expect(fake.calls).toHaveLength(1);
            expect(fake.calls[0]).toContain('Every available tool');
            expect(reranked[0]?.name).toBe('dead_code_detector');
        });

        it('retrieval accepts the live object-array shape end to end', async () => {
            const goal = 'flibbertigibbet supernova';
            const fake = countingFake([
                '```json\n[{"name":"dead_code_detector","purpose":"finds dead code","confidence":0.88}]\n```',
            ]);
            const reranked = await selectToolsForAsync(goal, 12, { llmCall: fake.call });
            expect(reranked[0]?.name).toBe('dead_code_detector');
        });

        it('falls through to retrieval when tier 2 refuses the candidates', async () => {
            const sync = selectToolsFor(SEO_GOAL, 30);
            expect(sync.map(s => s.name)).not.toContain('browser_seo_audit');

            const fake = countingFake([
                '{"ranking":["browser_find_text"],"confidence":0.3}',
                '{"ranking":["browser_seo_audit","browser_extract_meta"],"confidence":0.9}',
            ]);
            const reranked = await selectToolsForAsync(SEO_GOAL, 30, { llmCall: fake.call });
            expect(fake.calls).toHaveLength(2);
            expect(fake.calls[1]).toContain('Every available tool');
            expect(reranked[0]?.name).toBe('browser_seo_audit');
        });

        it('keeps the deterministic order when retrieval fails', async () => {
            const sync = selectToolsFor(TRANSLATE_GOAL, 12);
            const fake = countingFake(['total garbage, no json here']);
            const reranked = await selectToolsForAsync(TRANSLATE_GOAL, 12, { llmCall: fake.call });
            expect(reranked.map(s => s.name)).toEqual(sync.map(s => s.name));
        });
    });

    describe('kill switch and catalogue wrapper', () => {
        it('never calls the model when JOE_TOOL_RERANK=off', async () => {
            process.env.JOE_TOOL_RERANK = 'off';
            const fake = countingFake(['{"ranking":["github_repo_manager"],"confidence":0.99}']);
            const reranked = await selectToolsForAsync(HEALTH_GOAL, 12, { llmCall: fake.call });
            expect(fake.calls).toHaveLength(0);
            expect(reranked.map(s => s.name)).toEqual(selectToolsFor(HEALTH_GOAL, 12).map(s => s.name));
        });

        it('renders the reranked catalogue block', async () => {
            const fake = countingFake(['{"ranking":["github_repo_manager"],"confidence":0.9}']);
            const block = await catalogueForAsync(HEALTH_GOAL, 5, { llmCall: fake.call });
            expect(block.split('\n')[0]).toContain('github_repo_manager');
        });
    });

    describe('capabilityRouteAsync', () => {
        it('returns the deterministic decision unchanged without calling the model', async () => {
            expect(capabilityRoute(OCR_GOAL, {} as any)).toMatchObject({ tool: 'decide_capability_route' });
            const fake = countingFake(['{"pick":"shell_execute","confidence":0.99}']);
            const route = await capabilityRouteAsync(OCR_GOAL, {} as any, { llmCall: fake.call });
            expect(route).toMatchObject({ tool: 'decide_capability_route' });
            expect(route).not.toHaveProperty('via');
            expect(fake.calls).toHaveLength(0);
        });

        it('routes a refused goal to a feedable specialist', async () => {
            const goal = 'review the readability of my documentation';
            const ctx = { previewUrl: 'https://example.com' } as any;
            expect(capabilityRoute(goal, ctx)).toBeNull();
            const fake = countingFake(['{"pick":"browser_readability","confidence":0.9}']);
            const route = await capabilityRouteAsync(goal, ctx, { llmCall: fake.call });
            expect(route).toMatchObject({ tool: 'browser_readability', via: 'llm-rerank' });
            expect(route?.input).toMatchObject({ url: 'https://example.com' });
        });

        it('still refuses when the picked tool cannot be fed', async () => {
            const fake = countingFake(['{"pick":"i18n_translator","confidence":0.95}']);
            const route = await capabilityRouteAsync(TRANSLATE_GOAL, {} as any, { llmCall: fake.call });
            expect(route).toBeNull();
        });

        it('still refuses a plain question with no act verb, without calling the model', async () => {
            const fake = countingFake(['{"pick":"central_answer","confidence":0.99}']);
            const route = await capabilityRouteAsync('what is the best design?', {} as any, { llmCall: fake.call });
            expect(route).toBeNull();
            expect(fake.calls).toHaveLength(0);
        });

        it('still refuses below the route confidence threshold', async () => {
            const goal = 'review the readability of my documentation';
            const fake = countingFake(['{"pick":"browser_readability","confidence":0.4}']);
            const route = await capabilityRouteAsync(goal, { previewUrl: 'https://example.com' } as any, { llmCall: fake.call });
            expect(route).toBeNull();
        });
    });

    describe('pure helpers', () => {
        it('needsRerank skips only decisive winners', () => {
            expect(needsRerank([{ name: 'a', score: 12, line: '' }, { name: 'b', score: 5, line: '' }])).toBe(false);
            expect(needsRerank([{ name: 'a', score: 10, line: '' }, { name: 'b', score: 9, line: '' }])).toBe(true);
            expect(needsRerank([{ name: 'a', score: 0, line: '' }])).toBe(false);
            expect(needsRerank([])).toBe(false);
        });

        it('parseRanking accepts ranking and pick shapes and drops unknown names', () => {
            expect(parseRanking('{"ranking":["b","a"],"confidence":0.8}', ['a', 'b']))
                .toEqual({ ranking: ['b', 'a'], confidence: 0.8 });
            expect(parseRanking('prefix {"pick":"a","confidence":0.7} suffix', ['a', 'b']))
                .toEqual({ ranking: ['a'], confidence: 0.7 });
            expect(parseRanking('{"ranking":["zz","a"],"confidence":0.9}', ['a']))
                .toEqual({ ranking: ['a'], confidence: 0.9 });
            expect(parseRanking('no json', ['a'])).toBeNull();
            expect(parseRanking('{"ranking":["zz"],"confidence":0.9}', ['a'])).toBeNull();
            expect(parseRanking('{"ranking":["a"]}', ['a'])).toEqual({ ranking: ['a'], confidence: 0 });
        });

        it('parseRanking accepts the bare object-array shape small models emit live', () => {
            const liveShape = '```json\n[{"name":"b","purpose":"does b","confidence":0.95},{"name":"a","confidence":0.7}]\n```';
            expect(parseRanking(liveShape, ['a', 'b'])).toEqual({ ranking: ['b', 'a'], confidence: 0.95 });
            expect(parseRanking('[{"name":"zz"},{"name":"a","confidence":0.8}]', ['a']))
                .toEqual({ ranking: ['a'], confidence: 0 });
            expect(parseRanking('["b","a"]', ['a', 'b'])).toEqual({ ranking: ['b', 'a'], confidence: 0 });
            expect(parseRanking('{"tools":["b","a"],"confidence":0.75}', ['a', 'b']))
                .toEqual({ ranking: ['b', 'a'], confidence: 0.75 });
            expect(parseRanking('{"most_relevant":["b"],"confidence":0.9}', ['a', 'b']))
                .toEqual({ ranking: ['b'], confidence: 0.9 });
            expect(parseRanking('[{"name":"zz"}]', ['a'])).toBeNull();
        });
    });
});
