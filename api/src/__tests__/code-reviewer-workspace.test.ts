import fs from 'fs';
import os from 'os';
import path from 'path';

const mockCallLLM = jest.fn();
jest.mock('../core/llm', () => ({
    callLLM: (...args: any[]) => mockCallLLM(...args),
}));

import { CodeReviewerTool } from '../modules/tools/definitions/CodeReviewerTool';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('CodeReviewerTool workspace-bound review contract', () => {
    let workspaceRoot = '';
    let activeRootSpy: jest.SpyInstance;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-code-review-'));
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
    });

    afterEach(() => {
        activeRootSpy.mockRestore();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('reviews a relative output from the active workspace rather than API cwd', async () => {
        fs.writeFileSync(path.join(workspaceRoot, 'architecture.md'), '# Architecture\n\nA verified local artifact.\n');

        const result: any = await new CodeReviewerTool().execute({
            files: ['architecture.md'],
            reviewType: 'quick',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(true);
        expect(result.output).toMatchObject({
            filesRequested: 1,
            filesReviewed: 1,
            reviewedFiles: ['architecture.md'],
            missingFiles: [],
        });
        expect(result.logs.join('\n')).toContain(workspaceRoot);
    });

    it('rejects a review when any requested source file is absent', async () => {
        const result: any = await new CodeReviewerTool().execute({
            files: ['missing-source.ts'],
            reviewType: 'quick',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('could not review 1 requested file');
        expect(result.output).toMatchObject({
            filesRequested: 1,
            filesReviewed: 0,
            missingFiles: ['missing-source.ts'],
            overallScore: 0,
        });
    });

    it('turns a low score into an explicit quality-gate failure only when requested', async () => {
        fs.writeFileSync(path.join(workspaceRoot, 'weak.js'), [
            'var x = 1;',
            'console.log(x);',
            'eval("x");',
            'eval("x");',
            'eval("x");',
        ].join('\n'));

        const result: any = await new CodeReviewerTool().execute({
            files: ['weak.js'],
            reviewType: 'quick',
            minimumScore: 70,
            failOnCritical: true,
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('quality gate failed');
        expect(result.output).toMatchObject({
            filesRequested: 1,
            filesReviewed: 1,
            qualityGate: { minimumScore: 70, failOnCritical: true, passed: false },
        });
        expect(result.output.overallScore).toBeLessThan(70);
    });

    it('blocks only on deterministic critical evidence and carries its provenance', async () => {
        fs.writeFileSync(path.join(workspaceRoot, 'secret.ts'), 'const key = "sk-123456789012345678901234";\n');

        const result: any = await new CodeReviewerTool().execute({
            files: ['secret.ts'],
            reviewType: 'quick',
            failOnCritical: true,
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.output.summary).toMatchObject({ critical: 1, verifiedCritical: 1 });
        expect(result.output.qualityGate).toMatchObject({ blockingCritical: 1, passed: false });
        expect(result.output.issues[0]).toMatchObject({
            file: 'secret.ts',
            line: 1,
            severity: 'critical',
            verificationStatus: 'verified',
            evidenceEligible: true,
        });
    });

    it('keeps an LLM critical proposal visible as unverified without blocking', async () => {
        mockCallLLM.mockResolvedValueOnce(JSON.stringify({
            score: 85,
            issues: [{ line: 1, severity: 'critical', category: 'best-practice', message: 'The model suspects a design problem.' }],
            suggestions: [],
        }));
        fs.writeFileSync(path.join(workspaceRoot, 'clean.ts'), 'const answer = 42;\n');

        const result: any = await new CodeReviewerTool().execute({
            files: ['clean.ts'],
            reviewType: 'detailed',
            failOnCritical: true,
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(true);
        expect(result.output.summary).toMatchObject({ critical: 1, verifiedCritical: 0 });
        expect(result.output.qualityGate).toMatchObject({ blockingCritical: 0, passed: true });
        expect(result.output.issues).toContainEqual(expect.objectContaining({
            file: 'clean.ts',
            line: 1,
            severity: 'critical',
            verificationStatus: 'unverified',
            evidenceEligible: false,
            message: 'The model suspects a design problem.',
        }));
    });
});
