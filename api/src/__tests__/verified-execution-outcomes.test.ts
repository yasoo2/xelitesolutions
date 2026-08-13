import fs from 'fs';
import path from 'path';
import { composeAnswer, composeFailure } from '../core/orchestrator/answerComposer';

const source = (...segments: string[]) => fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8');

/**
 * Regression: a user saw «تمّ التنفيذ: تشغيل المشروع ومعاينته حيّاً» after
 * project_run had waited 45 seconds and explicitly reported ready:false.
 * A planned action is never delivery evidence; readiness and verification
 * must be reflected in the DAG state and the final answer.
 */
describe('verified execution outcomes', () => {
    it('never turns an unconfirmed live server into a completed chat answer', () => {
        const steps = [{
            id: 'project_run',
            task: 'تشغيل المشروع ومعاينته حيّاً',
            status: 'failed',
            result: {
                ready: false,
                verificationFailed: true,
                message: 'بدأ الخادم لكنه لم يستجب على أي منفذ خلال ٤٥ ثانية',
            },
        }];

        expect(composeAnswer(steps, 'ar')).toBe('');
        const report = composeFailure(steps, 'بدأ الخادم لكنه لم يستجب على أي منفذ خلال ٤٥ ثانية', 'ar');
        expect(report).toContain('تشغيل المشروع ومعاينته حيّاً');
        expect(report).toContain('لم يستجب');
    });

    it('marks an unconfirmed project_run as a non-recoverable verification failure', () => {
        const runTool = source('modules', 'tools', 'definitions', 'ProjectRunTool.ts');
        const unconfirmedBlock = runTool.slice(runTool.indexOf('if (!livePort) {'), runTool.indexOf('const url = `http://localhost:${livePort}/`;'));
        expect(unconfirmedBlock).toContain('ok: false');
        expect(unconfirmedBlock).toContain('verificationFailed: true');
        expect(unconfirmedBlock).toContain('message: readinessMessage');

        const orchestrator = source('orchestration', 'AgentOrchestrator.ts');
        const verificationGuard = orchestrator.indexOf('out.verificationFailed === true');
        const recovery = orchestrator.indexOf('this.attemptRecovery(');
        expect(verificationGuard).toBeGreaterThan(-1);
        expect(verificationGuard).toBeLessThan(recovery);
    });

    it('requires all work and verification to complete before a phase returns ok', () => {
        const phaseExecutor = source('modules', 'tools', 'definitions', 'PhaseExecutorTool.ts');
        expect(phaseExecutor).toContain("const ok = status === 'completed';");
        expect(phaseExecutor).toContain("task: 'Auto-build check'");
    });
});
