import fs from 'fs';
import path from 'path';
import { requestedProviderTimeoutMs } from '../core/llm/intelligent-router';

/**
 * Eval run500 round 4, 2026-10-23: on the owner's CPU a compact local plan
 * takes ~17 min, yet every local plan stopped at exactly 120 s and every page
 * section at 120 s: the engineering scope (issued only for an exact LOCAL
 * model) lived 5 minutes and handed the planner min(120 s, remaining), and a
 * caller's sized local deadline was capped at 180 s by the router.
 */
const ENV = ['LOCAL_BRAIN_LEASH_MAX', 'LOCAL_LLM_STRICT', 'LLM_PROVIDER', 'LOCAL_LLM_MODEL', 'LOCAL_LLM_BASE_URL'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('a local scope lives as long as its model needs', () => {
    it('a deadline for the served local model may reach the operator ceiling; a cloud one keeps 180 s', () => {
        process.env.LOCAL_BRAIN_LEASH_MAX = String(25 * 60_000);
        process.env.LOCAL_LLM_STRICT = '1';
        process.env.LLM_PROVIDER = 'local';
        process.env.LOCAL_LLM_MODEL = 'qwen3.5:9b-joe-q4_K_M';
        process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434/v1';
        expect(requestedProviderTimeoutMs({ modelConfig: { provider: 'auto' }, plannerTimeoutMs: 20 * 60_000 })).toBe(20 * 60_000);
        expect(requestedProviderTimeoutMs({ modelConfig: { provider: 'gemini', model: 'gemini-2.5-flash' }, plannerTimeoutMs: 20 * 60_000 })).toBe(180_000);
    });

    it('the engineering scope lives as long as the local ceiling, and its planner budget is sized', () => {
        const policy = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'AutonomousEngineeringPolicy.ts'), 'utf8');
        expect(policy).toContain('const scopeTtlMs = (): number => Math.max(TTL_MS, localPlannerCeilingMs());');
        expect(policy).toContain('now < scope.expires - scope.ttl');
        const toolService = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'ToolService.ts'), 'utf8');
        expect(toolService).toContain('Math.min(localPlanDeadlineMs(scope.request), scope.expires - Date.now())');
        expect(toolService).not.toContain('Math.min(120_000, scope.expires - Date.now())');
    });

    it('strict local counts as the only brain, like offline', () => {
        const router = fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf8');
        expect(router).toContain('const offlineSizedLeash = (offlineMode || localStrict)');
    });
});
