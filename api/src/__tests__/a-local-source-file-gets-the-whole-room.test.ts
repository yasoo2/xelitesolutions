/**
 * Eval run500, 2026-10-25 (P351, an interactive report with three charts): the
 * App.jsx artifact (24.5k characters of brief) asked the local model for a
 * fixed 6000 output tokens although the 16k window left ~8.1k. qwen3.5 thinks
 * before it writes and both count, so the file ended LOCAL_COMPLETION_LIMIT
 * after 95 minutes, and the rerun asked for the same 6000 again.
 *
 * A file the local model writes sets no cap of its own: the transport fits the
 * answer to the room the measured prompt leaves, and the deadline is sized for
 * that room. Other providers keep their bounded caps.
 */
import fs from 'fs';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { AIGeneratorTool, localArtifactDeadlineMs } from '../modules/tools/definitions/AIGeneratorTool';
import { noteLocalThroughput, resetLocalThroughputForTests } from '../core/llm/local-throughput';
import { workspaceService } from '../modules/services/WorkspaceService';

const ENV = ['LOCAL_LLM_STRICT', 'LLM_PROVIDER', 'LOCAL_LLM_MODEL', 'LOCAL_LLM_BASE_URL', 'LOCAL_BRAIN_LEASH_MAX', 'LOCAL_MAX_CONTEXT'] as const;
const saved: Record<string, string | undefined> = {};
const s = 1_000_000_000;
const DIR = '__local_whole_room_test__';
const tool = new AIGeneratorTool();

const pinLocal = () => {
    process.env.LOCAL_LLM_STRICT = '1';
    process.env.LLM_PROVIDER = 'local';
    process.env.LOCAL_LLM_MODEL = 'qwen3.5:9b-joe-q4_K_M';
    process.env.LOCAL_BRAIN_LEASH_MAX = String(6 * 60 * 60_000);
};

beforeEach(() => {
    for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
    resetLocalThroughputForTests();
    callLLM.mockReset();
    callLLM.mockResolvedValue('export default function App() { return <main>Ready</main>; }');
});
afterEach(() => {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    resetLocalThroughputForTests();
});
afterAll(() => {
    try { fs.rmSync(path.resolve(workspaceService.getActiveRoot(), DIR), { recursive: true, force: true }); } catch { }
});

describe('a local source file gets the whole room', () => {
    it('the local model is asked for no fixed output cap', async () => {
        pinLocal();
        const res: any = await tool.execute(
            { path: path.join(DIR, 'App.jsx'), description: 'Write the report component with three charts and a date filter.' },
            { engineeringPipeline: true, modelConfig: { provider: 'auto' } },
        );
        expect(res.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(1);
        expect(callLLM.mock.calls[0][2].maxCompletionTokens).toBeUndefined();
    });

    it('another provider keeps its bounded frontend cap', async () => {
        pinLocal();
        const res: any = await tool.execute(
            { path: path.join(DIR, 'View.jsx'), description: 'Write the report component.' },
            { engineeringPipeline: true, modelConfig: { provider: 'gemini', model: 'gemini-2.5-flash' } },
        );
        expect(res.ok).toBe(true);
        expect(callLLM.mock.calls[0][2].maxCompletionTokens).toBe(1200);
    });

    it('the deadline is sized for the room the window leaves, not for 6000', () => {
        pinLocal();
        noteLocalThroughput({ prompt_eval_count: 1264, prompt_eval_duration: 253 * s, eval_count: 504, eval_duration: 320 * s });
        const ctx = { modelConfig: { provider: 'auto' } };
        const system = 'x'.repeat(1276);
        const user = 'y'.repeat(23004);
        // 24.3k chars ≈ 8.1k prompt tokens; a 16k window leaves ~8.1k for the answer.
        expect(localArtifactDeadlineMs(ctx, system, user)).toBeGreaterThan(localArtifactDeadlineMs(ctx, system, user, 6000)!);
        // The operator's larger window (a server) gives a larger room and a longer deadline.
        process.env.LOCAL_MAX_CONTEXT = '32768';
        const server = localArtifactDeadlineMs(ctx, system, user)!;
        delete process.env.LOCAL_MAX_CONTEXT;
        expect(server).toBeGreaterThan(localArtifactDeadlineMs(ctx, system, user)!);
    });
});
