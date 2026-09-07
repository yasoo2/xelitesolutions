import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseExplicitAppendFileRequest } from '../core/orchestrator/file-intent';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { composeAnswer } from '../core/orchestrator/answerComposer';
import { WriteFileTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('explicit existing-file append contract', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-append-contract-'));
        jest.spyOn(workspaceService, 'getActiveRoot').mockImplementation((workspaceId?: string) => {
            if (workspaceId !== 'owned-workspace') throw new Error(`unexpected workspace ${workspaceId}`);
            return root;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('recognises a literal fourth-line append without asking a provider to infer the edit', async () => {
        const goal = 'Append exactly one fourth line `delta=4` to proof.txt, preserve its existing three lines unchanged, read the whole file back, and report the final line count.';
        expect(parseExplicitAppendFileRequest(goal)).toEqual({
            path: 'proof.txt', content: 'delta=4', readBack: true, expectedFinalLineCount: 4,
        });
        const plan: any = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });
        expect(plan.metadata).toMatchObject({ matchedBy: 'explicit-file-append-contract', deterministic: true });
        expect(plan.steps.map((step: any) => step.tool)).toEqual(['write_file', 'read_file']);
        expect(plan.steps[0].input).toMatchObject({ mode: 'append', requireExisting: true, ensureSingleAppend: true, expectedFinalLineCount: 4 });
    });

    test('fails clearly without creating a missing file or its parent directory', async () => {
        const result: any = await new WriteFileTool().execute({
            path: 'missing/facts.txt', content: 'delta=4', mode: 'append', requireExisting: true,
        }, { workspaceId: 'owned-workspace' });
        expect(result.ok).toBe(false);
        expect(result.output).toMatchObject({ nonRecoverable: true, code: 'file_not_found', path: 'missing/facts.txt' });
        expect(result.error).toContain('does not exist in the current workspace');
        expect(fs.existsSync(path.join(root, 'missing'))).toBe(false);
    });

    test('preserves existing lines, appends once, and makes retries idempotent', async () => {
        fs.writeFileSync(path.join(root, 'facts.txt'), 'alpha=1\nbeta=2\ngamma=3', 'utf8');
        const tool = new WriteFileTool();
        const input = { path: 'facts.txt', content: 'delta=4', mode: 'append', requireExisting: true, ensureSingleAppend: true, expectedFinalLineCount: 4 };
        const first: any = await tool.execute(input, { workspaceId: 'owned-workspace' });
        const retry: any = await tool.execute(input, { workspaceId: 'owned-workspace' });
        expect(first.output).toMatchObject({ appended: true, totalLines: 4 });
        expect(retry.output).toMatchObject({ appended: false, alreadySatisfied: true, totalLines: 4 });
        expect(fs.readFileSync(path.join(root, 'facts.txt'), 'utf8')).toBe('alpha=1\nbeta=2\ngamma=3\ndelta=4');
    });

    test('refuses an unexpected initial line count instead of corrupting the file', async () => {
        fs.writeFileSync(path.join(root, 'facts.txt'), 'alpha=1\nbeta=2', 'utf8');
        const result: any = await new WriteFileTool().execute({
            path: 'facts.txt', content: 'delta=4', mode: 'append', requireExisting: true, ensureSingleAppend: true, expectedFinalLineCount: 4,
        }, { workspaceId: 'owned-workspace' });
        expect(result.ok).toBe(false);
        expect(result.output).toMatchObject({ nonRecoverable: true, code: 'line_count_mismatch' });
        expect(fs.readFileSync(path.join(root, 'facts.txt'), 'utf8')).toBe('alpha=1\nbeta=2');
    });

    test('composes a concise verified user report from append and read-back evidence', () => {
        const answer = composeAnswer([
            { id: 'append', tool: 'write_file', input: { path: 'facts.txt', mode: 'append' }, status: 'completed', result: { operation: 'append', appended: true, totalLines: 4 } },
            { id: 'read', tool: 'read_file', input: { path: 'facts.txt' }, status: 'completed', result: { content: 'a\nb\nc\nd', totalLines: 4 } },
        ], 'en');
        expect(answer).toContain('Updated facts.txt');
        expect(answer).toContain('Final line count:** 4');
        expect(answer).toContain('a\nb\nc\nd');
        expect(answer).not.toContain('success');
    });

    test('also reports the verified line count for a deterministic create then read-back', () => {
        const answer = composeAnswer([
            { id: 'write', tool: 'write_file', input: { path: 'seed.txt' }, status: 'completed', result: { operation: 'overwrite', totalLines: 3 } },
            { id: 'read', tool: 'read_file', input: { path: 'seed.txt' }, status: 'completed', result: { content: 'a\nb\nc', totalLines: 3 } },
        ], 'en');
        expect(answer).toContain('Updated seed.txt');
        expect(answer).toContain('Final line count:** 3');
        expect(answer).toContain('a\nb\nc');
    });
});
