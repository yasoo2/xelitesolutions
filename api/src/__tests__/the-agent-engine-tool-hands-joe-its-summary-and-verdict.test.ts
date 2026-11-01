/**
 * THE AGENT ENGINE TOOL HANDS JOE ITS SUMMARY AND ITS VERDICT.
 *
 * Measured on 2026-11-01: a run the engine delivered and Joe's gates verified
 * reached the chat as «Done: - <the plan step's description>». The tool had
 * returned deliveryOutput's whole { ok, output } as its output, so the summary
 * and pipelineFinal sat one level too deep: the answer composer found no words
 * and listed the plan step instead, and the final-outcome rule could not see a
 * refused delivery as final.
 *
 * The run's own loop and model are replaced; everything the tool builds from
 * their result is real.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-handoff-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let engineResult: any;
jest.mock('../core/engine/loop', () => ({ runEngine: jest.fn(async () => engineResult) }));
jest.mock('../core/engine/model', () => ({
    engineModelChoice: () => ({ provider: 'local', model: 'test-model', baseUrl: 'http://127.0.0.1:11434/v1' }),
    engineBrain: async () => ({ model: { label: 'test', vision: false, contextTokens: () => 16_000, step: async () => { throw new Error('not used'); } }, ask: async () => '' }),
}));
jest.mock('../core/engine/run', () => ({
    projectFolderFor: async () => ({ dir: path.join(root, 'joe-app-1') }),
    registerProjectFolder: () => undefined,
    uiEmitter: () => () => undefined,
}));
jest.mock('../modules/tools/definitions/EngineShellTools', () => ({
    ...jest.requireActual('../modules/tools/definitions/EngineShellTools'),
    machineFacts: async () => ({ platform: 'win32', shell: 'Windows PowerShell 5.1' }),
}));

import { tools } from '../modules/tools/registry';
import { AgentEngineTool } from '../modules/tools/definitions/AgentEngineTool';
import { isFinalPipelineOutcome } from '../orchestration/AgentOrchestrator';
import { composeAnswer } from '../core/orchestrator/answerComposer';

function verifiedRun(summary: string): any {
    return {
        status: 'delivered', summary, filesChanged: [], served: [], steps: 18, model: 'test',
        verification: {
            passed: true, checks: [], unproven: [], at: 0,
            delivery: {
                verdict: { verified: true, unmeasured: [], partial: false },
                measurements: [{ instrument: 'live', ok: true }],
                liveUrl: 'http://127.0.0.1:4301/', executionStatus: 'completed', verificationStatus: 'passed', deliveryStatus: 'delivered',
            },
        },
    };
}

describe('agent_engine hands Joe what the run proved', () => {
    it('a delivered run reaches the chat as its own summary, with the live address', async () => {
        expect(tools.some(t => t.name === 'agent_engine')).toBe(true);
        engineResult = verifiedRun('تطبيق قائمة مهام بالعربية يحفظ المهام بعد إعادة التحميل.');
        const result: any = await AgentEngineTool.execute!({ request: 'اعمل لي تطبيق قائمة مهام بالعربي' }, { runId: 'run-h1', sessionId: 's1', language: 'en' });

        expect(result.ok).toBe(true);
        expect(result.output).toMatchObject({ verified: true, deliveryStatus: 'delivered', pipelineFinal: true });
        const answer = composeAnswer([{ id: 'project_pipeline', task: 'استكشف الأدلة، ثم خطط ونفّذ', tool: 'project_pipeline', status: 'completed', result: result.output } as any], 'en');
        expect(answer).toMatch(/تطبيق قائمة مهام بالعربية/);
        expect(answer).toMatch(/http:\/\/127\.0\.0\.1:4301\//);
        expect(answer).not.toMatch(/^Done:/);
        // An Arabic request is answered in Arabic even with the interface in English.
        expect(answer).toMatch(/تحقّقت فحوص جو من التسليم/);
    });

    it('a refused delivery is final for the orchestrator, and says why', async () => {
        engineResult = { status: 'failed', summary: '', reason: 'the deadline arrived before the checks passed', filesChanged: [], served: [], steps: 40, model: 'test' };
        const result: any = await AgentEngineTool.execute!({ request: 'Build a booking page' }, { runId: 'run-h2', sessionId: 's1' });

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/deadline arrived/);
        expect(isFinalPipelineOutcome('react_project', result.output)).toBe(true);
        expect(String(result.output.summary)).toMatch(/Not delivered/);
    });
});
