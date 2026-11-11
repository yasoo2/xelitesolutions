import fs from 'fs';
import path from 'path';
import { localArtifactDeadlineMs, ENGINEERING_ARTIFACT_PROVIDER_DEADLINE_MS, ENGINEERING_LLM_GENERATION_DEADLINE_MS } from '../modules/tools/definitions/AIGeneratorTool';
import { noteLocalThroughput, resetLocalThroughputForTests } from '../core/llm/local-throughput';

/**
 * Eval round 10, 2026-10-23 (P001): every page component written by
 * ai_write_file (20k characters of context, 1200 output tokens) was aborted at
 * exactly 60 s. The 60 s provider bound leaves time to fail over to the next
 * provider; with the local model as the only brain there is none. A call the
 * local model serves is sized from its size and the machine's measured speed.
 */
const ENV = ['LOCAL_LLM_STRICT', 'LLM_PROVIDER', 'LOCAL_LLM_MODEL', 'LOCAL_LLM_BASE_URL', 'LOCAL_BRAIN_LEASH_MAX'] as const;
const saved: Record<string, string | undefined> = {};
const s = 1_000_000_000;
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } resetLocalThroughputForTests(); });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } resetLocalThroughputForTests(); });

describe('a local artifact is not cut at sixty seconds', () => {
    const pinLocal = () => {
        process.env.LOCAL_LLM_STRICT = '1';
        process.env.LLM_PROVIDER = 'local';
        process.env.LOCAL_LLM_MODEL = 'qwen3.5:9b-joe-q4_K_M';
        process.env.LOCAL_BRAIN_LEASH_MAX = String(6 * 60 * 60_000);
    };

    it('a CPU-served component gets minutes, sized from the measured machine', () => {
        pinLocal();
        noteLocalThroughput({ prompt_eval_count: 1264, prompt_eval_duration: 253 * s, eval_count: 504, eval_duration: 320 * s });
        const ms = localArtifactDeadlineMs({ modelConfig: { provider: 'auto' } }, 'x'.repeat(1120), 'y'.repeat(20135), 1200);
        expect(ms).toBeGreaterThan(ENGINEERING_LLM_GENERATION_DEADLINE_MS);
        expect(ms).toBeGreaterThan(20 * 60_000);
    });

    it('another provider keeps the 60 s fail-over bound', () => {
        pinLocal();
        expect(localArtifactDeadlineMs({ modelConfig: { provider: 'gemini', model: 'gemini-2.5-flash' } }, 'x', 'y', 1200)).toBeUndefined();
        expect(ENGINEERING_ARTIFACT_PROVIDER_DEADLINE_MS).toBe(60_000);
    });

    it('the artifact call uses it for both the provider bound and the outer leash', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'AIGeneratorTool.ts'), 'utf8');
        expect(src).toContain('if (localDeadline !== undefined && llmContext) llmContext.providerTimeoutMs = localDeadline;');
        expect(src).toContain('? localDeadline + 30_000');
    });
});

describe('a local frontend component gets the room of any source file', () => {
    // Eval round 12 (P001): an App component ended LOCAL_COMPLETION_LIMIT at 1200
    // tokens after 17.7 min; qwen3.5 thinks before it writes and both count.
    // Updated 2026-10-25 (run500 P351): the local branch used to be a fixed 6000,
    // which still cut a large App.jsx below the window's room. A local file now
    // sets no cap (a-local-source-file-gets-the-whole-room.test.ts drives it);
    // the bounded frontend caps still apply to other providers only.
    it('the frontend cap applies to other providers only', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'AIGeneratorTool.ts'), 'utf8');
        expect(src).toMatch(/servedByLocalModel\(context\)\s*\? undefined\s*: artifact\.kind === 'frontend_asset'\s*\? \(complexFrontendArtifact \? 2400 : 1200\)\s*: 6000/);
    });
});
