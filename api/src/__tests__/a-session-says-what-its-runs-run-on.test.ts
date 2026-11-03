/**
 * ⛔ A SESSION SAYS WHAT ITS RUNS RUN ON.
 *
 * 2026-11-04: the owner opened a session the exam was running on Claude Haiku,
 * and the provider button said «Auto · free» in red — the browser's choice for
 * his next message, not the run he was looking at. «المفروض يكون كلود».
 *
 * The run's record names its provider and model (never a key), run_started
 * carries them to the interface, and /sessions/:id/engine answers for a
 * session — from the record, or from what the engine reported when it ended.
 */
import fs from 'fs';
import path from 'path';
import { createRunEvidence, engineOfRuns, getRunEvidence, runEngineOf, type RunEvidenceRecord } from '../shared/run-evidence-store';

const run = (extra: Partial<RunEvidenceRecord>): RunEvidenceRecord => ({ runId: 'r', startedAt: '', updatedAt: '', events: [], ...extra });

describe('what a run runs on', () => {
    it('is a provider and a model, bounded, and never a key', () => {
        expect(runEngineOf('anthropic', 'claude-haiku-5-5')).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' });
        expect(runEngineOf('', 'x')).toBeUndefined();
        expect(JSON.stringify(runEngineOf('anthropic', 'claude-haiku-5-5'))).not.toMatch(/key/i);
        expect(runEngineOf('a'.repeat(500), 'b'.repeat(500))).toEqual({ provider: 'a'.repeat(60), model: 'b'.repeat(120) });
    });

    it('a session answers with its latest run: the record first, else what the engine reported at the end', () => {
        expect(engineOfRuns([
            run({ runId: 'old', engine: { provider: 'auto', model: '' } }),
            run({ runId: 'new', events: [{ type: 'engine_final', data: { model: 'anthropic:claude-haiku-5-5' } }] }),
        ])).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' });
        expect(engineOfRuns([run({ engine: { provider: 'anthropic', model: 'claude-sonnet-5-5' } })])).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
        expect(engineOfRuns([run({})])).toBeNull();
        expect(engineOfRuns([])).toBeNull();
    });

    it('the record keeps the engine it was created with', async () => {
        const runId = `engine-${Date.now()}`;
        await createRunEvidence(runId, { sessionId: 'engine-session', engine: { provider: 'anthropic', model: 'claude-haiku-5-5' } });
        expect((await getRunEvidence(runId))?.engine).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' });
    });

    it('the run_started frame and the run record both carry it, and the session route answers', () => {
        const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
        expect(read('api', 'routes', 'run.ts')).toContain("engine: runEngineOf(provider || 'auto', model)");
        expect(read('modules', 'services', 'AgentLoopService.ts')).toContain("runEngineOf(options.modelConfig?.provider || 'auto', options.modelConfig?.model)");
        expect(read('api', 'routes', 'sessions.ts')).toContain("router.get('/:id/engine', authenticate as any, SessionController.sessionEngine);");
    });
});
