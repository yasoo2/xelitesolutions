/**
 * NEGATIVE INTEGRATION TESTS FOR VERIFICATION CONTRACT GAPS
 *
 * These tests verify the two unresolved gaps identified in NVIDIA's
 * CRITICAL-REAL-JOE-UI-001 review (2026-09-29):
 *
 * Gap A: Intermediate prose verifiers advance phases with zero passed receipts
 *   - PhaseExecutorTool.ts:2283 initializes status=completed from successful tasks
 *   - Its verification branch at 2296 runs ONLY for object-shaped verificationTask
 *   - AgentLoopService.ts:1088 advances when phaseResult.ok and status=completed
 *   - Result: intermediate prose-verifier phases ADVANCE on task success with ZERO passed receipts
 *
 * Gap B: Final-receipt gap for non-React plans
 *   - ensurePlanFinalVerification is react_project ONLY (plan-verification.ts:14-38)
 *   - ProjectPlannerTool.ts:1633 adds it in constrained frontend fallback, not universal guarantee
 *   - A dropped final verifier (no observed output) completes on tasks exactly like a genuinely absent verifier
 *   - Downstream acceptance gates still bite, but this is not a structural guarantee
 *
 * These regression tests guard the repaired verification gaps and must stay passing.
 */

import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';
import { executeTool } from '../modules/services/ToolService';

// Mock executeTool for controlled testing
jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));

const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

const createMockExecutionContext = (overrides = {}) => ({
    sessionId: 'test-session',
    workspaceId: 'test-workspace',
    userId: 'test-user',
    traceId: 'test-trace',
    onProgress: () => {},
    onThought: () => {},
    ...overrides,
});

describe('Gap A: Intermediate prose verification must NOT advance phase without behavioral check', () => {
    let phaseExecutor: PhaseExecutorTool;

    beforeEach(() => {
        phaseExecutor = new PhaseExecutorTool();
        mockedExecuteTool.mockReset();
    });

    it('should NOT complete intermediate phase when prose-origin verification only observes output (no behavioral check)', async () => {
        // This test verifies that an intermediate phase with a prose verificationTask
        // (normalized to read_file by sanitizer) does NOT advance to completed
        // when the verification is only an observation (prose-origin) and not a
        // real behavioral check.

        // Mock task execution to succeed
        mockedExecuteTool.mockImplementation(async (toolName: string, input: any) => {
            if (toolName === 'ai_write_file') {
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { path: input.path, message: 'File written' } };
            }
            if (toolName === 'read_file') {
                // read_file succeeds (file exists) but this is a prose-origin observation
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { content: 'file content' } };
            }
            return { ok: true, logs: [], artifacts: [], error: undefined, output: {} };
        });

        // Create a plan with intermediate phase that has prose verificationTask
        const plan = {
            phaseNumber: 2, // intermediate phase
            name: 'Implementation',
            tasks: [
                { task: 'Write implementation', tool: 'ai_write_file', args: { path: 'src/impl.ts', description: 'Implementation' }, priority: 'high', realisticMinutes: 10 }
            ],
            verificationTask: { tool: 'read_file', args: { path: 'src/impl.ts' } }, // normalized from prose
            verificationNote: 'Verify implementation works', // original prose preserved
            deliverables: ['src/impl.ts'],
            estimatedTime: '10 minutes',
        };

        const executionContext = createMockExecutionContext();

        const result = await phaseExecutor.execute({ phase: plan }, executionContext);

        // The phase should NOT be ok because the verification was prose-origin
        // and prose-origin verifications don't count as real behavioral checks
        expect(result.ok).toBe(false);
        expect(result.output.status).not.toBe('completed');
        // Should be 'partial' because tasks succeeded but verification was only observation
        expect(result.output.status).toBe('partial');
        // The verification should be recorded as observation only
        const verificationResult = result.output.results.find((r: any) => r.tool === 'read_file');
        expect(verificationResult).toBeDefined();
        expect(verificationResult?.message).toContain('not a behavioral check');
        // verificationNote should be preserved in output
        expect(result.output).toHaveProperty('verificationNote', 'Verify implementation works');
    });

    it('should advance intermediate phase when structured verificationTask passes behavioral check', async () => {
        // This test verifies that a structured verificationTask (not prose-origin)
        // DOES allow phase advancement when it passes.

        mockedExecuteTool.mockImplementation(async (toolName: string, input: any) => {
            if (toolName === 'ai_write_file') {
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { path: input.path, message: 'File written' } };
            }
            if (toolName === 'auto_tester') {
                // Structured verification that passes
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { passed: true, message: 'Tests passed' } };
            }
            return { ok: true, logs: [], artifacts: [], error: undefined, output: {} };
        });

        const plan = {
            phaseNumber: 2,
            name: 'Implementation',
            tasks: [
                { task: 'Write implementation', tool: 'ai_write_file', args: { path: 'src/impl.ts', description: 'Implementation' }, priority: 'high', realisticMinutes: 10 }
            ],
            verificationTask: { tool: 'auto_tester', args: { testType: 'unit', projectPath: 'src' } }, // structured verification
            deliverables: ['src/impl.ts'],
            estimatedTime: '10 minutes',
        };

        const executionContext = createMockExecutionContext();

        const result = await phaseExecutor.execute({ phase: plan }, executionContext);

        // Should advance because structured verification passed
        expect(result.ok).toBe(true);
        expect(result.output.status).toBe('completed');
    });
});

describe('Gap B: Non-React final plans must NOT complete without final verification receipt', () => {
    let phaseExecutor: PhaseExecutorTool;

    beforeEach(() => {
        phaseExecutor = new PhaseExecutorTool();
        mockedExecuteTool.mockReset();
    });

    it('should NOT complete non-React final phase when prose-origin verification only observes', async () => {
        // This test verifies that a non-React final phase (e.g., CLI tool)
        // with a prose verificationTask (normalized to read_file/project_detect)
        // does NOT complete when the verification is only an observation.

        mockedExecuteTool.mockImplementation(async (toolName: string, input: any) => {
            if (toolName === 'scaffold_project') {
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { path: 'my-cli', message: 'Project scaffolded' } };
            }
            if (toolName === 'ai_write_file') {
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { path: input.path, message: 'File written' } };
            }
            if (toolName === 'read_file') {
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { content: 'file content' } };
            }
            if (toolName === 'project_detect') {
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { detected: true } };
            }
            return { ok: true, logs: [], artifacts: [], error: undefined, output: {} };
        });

        const plan = {
            phaseNumber: 2, // final phase
            name: 'Implementation',
            tasks: [
                { task: 'Write CLI entry', tool: 'ai_write_file', args: { path: 'my-cli/src/index.js', description: 'CLI entry point' }, priority: 'high', realisticMinutes: 10 }
            ],
            verificationTask: { tool: 'read_file', args: { path: 'my-cli/src/index.js' } }, // normalized from prose
            verificationNote: 'Run the CLI and verify it works', // original prose preserved
            deliverables: ['my-cli/src/index.js'],
            estimatedTime: '10 minutes',
        };

        const projectContext = {
            projectName: 'cli-tool',
            isFinalPhase: true, // This is the final phase
            createsNewProject: true,
            sessionId: 'test-session',
            workspaceId: 'test-workspace',
            userId: 'test-user',
        };

        const executionContext = createMockExecutionContext({ projectContext });

        const result = await phaseExecutor.execute({ phase: plan, projectContext }, executionContext);

        // The final phase should NOT be ok because the verification was prose-origin
        // and prose-origin verifications don't count as real behavioral checks
        expect(result.ok).toBe(false);
        expect(result.output.status).not.toBe('completed');
        // Should be 'partial' because tasks succeeded but verification was only observation
        expect(result.output.status).toBe('partial');
        // verificationNote should be preserved in output
        expect(result.output).toHaveProperty('verificationNote', 'Run the CLI and verify it works');
    });

    it('should complete non-React final phase when structured verificationTask passes', async () => {
        // This test verifies that a non-React final phase with a structured
        // verificationTask DOES complete when it passes.

        mockedExecuteTool.mockImplementation(async (toolName: string, input: any) => {
            if (toolName === 'scaffold_project') {
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { path: 'my-cli', message: 'Project scaffolded' } };
            }
            if (toolName === 'ai_write_file') {
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { path: input.path, message: 'File written' } };
            }
            if (toolName === 'shell_execute') {
                // Structured verification that runs a test command (npm test)
                // This matches the isVerificationTool patterns for shell_execute
                return { ok: true, logs: [], artifacts: [], error: undefined, output: { stdout: 'Tests passed', exitCode: 0 } };
            }
            return { ok: true, logs: [], artifacts: [], error: undefined, output: {} };
        });

        const plan = {
            phaseNumber: 2,
            name: 'Implementation',
            tasks: [
                { task: 'Write CLI entry', tool: 'ai_write_file', args: { path: 'my-cli/src/index.js', description: 'CLI entry point' }, priority: 'high', realisticMinutes: 10 }
            ],
            verificationTask: { tool: 'shell_execute', args: { command: 'npm test' } }, // structured verification - test command
            deliverables: ['my-cli/src/index.js'],
            estimatedTime: '10 minutes',
        };

        const projectContext = {
            projectName: 'cli-tool',
            isFinalPhase: true,
            createsNewProject: true,
            sessionId: 'test-session',
            workspaceId: 'test-workspace',
            userId: 'test-user',
        };

        const executionContext = createMockExecutionContext({ projectContext });

        const result = await phaseExecutor.execute({ phase: plan, projectContext }, executionContext);

        // Should complete because structured verification passed
        expect(result.ok).toBe(true);
        expect(result.output.status).toBe('completed');
    });
});

describe('Compact receipt provenance: verificationNote must appear in compactPhaseReceipt', () => {
    it('should include verificationNote in compactPhaseReceipt when phase has prose-origin verification', () => {
        const { compactPhaseReceipt } = require('../modules/services/AgentLoopService');

        // Simulate PhaseExecutor output with verificationNote
        const phaseOutput = {
            phaseNumber: 1,
            phaseName: 'Test',
            status: 'completed',
            execution: 'ran',
            completedTasks: 1,
            executedTasks: 1,
            skippedTasks: 0,
            reusedTasks: 0,
            totalTasks: 1,
            results: [
                { task: 'Write file', tool: 'ai_write_file', ok: true, execution: 'ran' },
                { task: 'Verify the test file works', tool: 'read_file', ok: true, execution: 'ran', message: 'Prose-origin verification observed; not a behavioral check' }
            ],
            nextPhase: 2,
            deliverables: ['src/test.ts'],
            estimatedTime: '5 minutes',
            verificationNote: 'Verify the test file works',
            verificationFailed: false,
            verificationUnavailable: false,
        };

        const receipt = compactPhaseReceipt(phaseOutput, [], 'completed', {});

        // verificationNote should be in the compact receipt
        expect(receipt.verificationNote).toBe('Verify the test file works');
    });

    it('should include verificationNote in compactPhaseReceipt when verification fails', () => {
        const { compactPhaseReceipt } = require('../modules/services/AgentLoopService');

        const phaseOutput = {
            phaseNumber: 1,
            phaseName: 'Test',
            status: 'partial',
            execution: 'ran',
            completedTasks: 1,
            executedTasks: 1,
            skippedTasks: 0,
            reusedTasks: 0,
            totalTasks: 1,
            results: [
                { task: 'Write file', tool: 'ai_write_file', ok: true, execution: 'ran' },
                { task: 'Verify the test file works', tool: 'read_file', ok: false, execution: 'ran', error: 'File not found' }
            ],
            nextPhase: 2,
            deliverables: ['src/test.ts'],
            estimatedTime: '5 minutes',
            verificationNote: 'Verify the test file works',
            verificationFailed: true,
        };

        const receipt = compactPhaseReceipt(phaseOutput, [], 'partial', {});

        expect(receipt.verificationNote).toBe('Verify the test file works');
        expect(receipt.verificationFailed).toBe(true);
    });
});

describe('QA evidence persistence: measured URL and geometry', () => {
    it('retains defect targets and geometry in inspectUi results at measured widths', async () => {
        // Controlled measurements test the public report boundary, not browser accuracy.
        const { inspectUi, VIEWPORTS } = await import('../core/quality/ui-inspection');
        let viewport = { width: 1280, height: 900 };
        const target = { sel: 'header nav', x: 12, y: 20, w: 420, h: 180,
            children: [{ sel: 'header button', x: 370, y: 30, w: 64, h: 40 }] };
        const header = { sel: 'header', w: 390, h: 180, rows: 3, offscreenControls: 1 };
        const page = {
            url: jest.fn(async () => 'https://example.test/calculator'),
            setViewportSize: jest.fn(async (size: { width: number; height: number }) => { viewport = size; }),
            waitForTimeout: jest.fn(async () => {}),
            evaluate: jest.fn(async (fn: Function) => {
                if (fn.name === 'measureContrast') return { checked: 0, skipped: 0, samples: [] };
                if (fn.name === 'measureA11y') return { focusables: 1, hasNav: true, issues: [] };
                if (fn.name === 'measureContentComposition') return { hasImageWorkflow: false };
                if (fn.name === 'measureResponsive') return {
                    actualVw: viewport.width, overflowX: viewport.width === 390,
                    wide: ['header nav'], wideEvidence: [target], boxes: [],
                    tiny: 0, smallFonts: 0, clipped: 0, hasViewportMeta: true,
                    fragmentedHeader: viewport.width === 390 ? header : null,
                };
                return viewport;
            }),
        };
        const report = await inspectUi(page);
        expect(report.metrics.viewports).toEqual(VIEWPORTS.map(vp => `${vp.w}x${vp.h}`));
        expect(page.setViewportSize).toHaveBeenCalledTimes(VIEWPORTS.length);
        expect(report.metrics.perWidth.mobile).toMatchObject({ requested: 390, actual: 390, overflowX: true });
        expect(report.findings.find(f => f.code === 'mobile_overflow')).toMatchObject({
            evidence: [{ ...target, url: 'https://example.test/calculator' }],
        });
        expect(report.findings.find(f => f.code === 'mobile_header_fragmented')).toMatchObject({
            evidence: [{ ...header, url: 'https://example.test/calculator' }],
        });
    });
});

describe('CLI routing: hasExplicitRecordSchema must not misclassify CLI as web app', () => {
    it('should not treat CSV input columns as persistent app schema', () => {
        const { hasExplicitRecordSchema, isCliRequest } = require('../core/design/app-blueprints');

        // CLI request with CSV input should be detected as CLI
        const cliRequest = 'Create a TypeScript CLI tool that reads a CSV file with columns name,email,age and outputs JSON';
        expect(isCliRequest(cliRequest)).toBe(true);
        expect(hasExplicitRecordSchema(cliRequest)).toBe(false);

        // Another CLI request
        const cliRequest2 = 'Build a Python command-line tool that reads a local JSON file and prints matching entries';
        expect(isCliRequest(cliRequest2)).toBe(true);
        expect(hasExplicitRecordSchema(cliRequest2)).toBe(false);

        // Web app request should NOT be CLI
        const webRequest = 'Build a web app with user login and dashboard';
        expect(isCliRequest(webRequest)).toBe(false);

        // POS system should be system, not web app
        const posRequest = 'Create a POS inventory system with products table';
        // POS detection is handled elsewhere
    });
});