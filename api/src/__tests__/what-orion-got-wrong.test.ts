/**
 * Regression: an engineering request is classified from declared work and
 * inspected evidence, never from a product/example name.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isMissingPython, pythonExecutable } from '../core/quality/python-runtime';

const source = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('engineering routing is name-neutral and evidence-first', () => {
    test('the planner contains no product-name route and sends engineering scope to the shared pipeline', () => {
        const planner = source('core/orchestrator/PlanningEngine.ts');
        expect(planner).toContain('Product names never decide an engineering route.');
        expect(planner).toContain('const engineeringSignals =');
        expect(planner).toContain("tool: 'project_pipeline'");
        expect(planner).not.toMatch(/isOrionBusinessOperatingSystemRequest|orion-business-operating-system/i);
    });

    test('a plan can record generic execution facts without a product-specific type', () => {
        const planner = source('core/orchestrator/PlanningEngine.ts');
        const iface = planner.slice(planner.indexOf('export interface ExecutionPlan'), planner.indexOf('export class PlanningEngine'));
        expect(iface).toMatch(/deterministic\?: boolean;/);
        expect(iface).toMatch(/localOnly\?: boolean;/);
        expect(iface).toMatch(/matchedBy\?: string;/);
    });
});

describe('a missing interpreter is a skipped check, never a manufactured failure', () => {
    test('the shapes of "no such program" are recognised on every platform', () => {
        expect(isMissingPython({ ok: false, error: 'spawn python3 ENOENT' })).toBe(true);
        expect(isMissingPython({ ok: false, error: '', exitCode: 9009 })).toBe(true);
        expect(isMissingPython({ ok: false, output: "'python' is not recognized as an internal or external command" })).toBe(true);
    });

    test('a real test failure is never mistaken for a missing interpreter', () => {
        expect(isMissingPython({ ok: false, error: 'FAILED (failures=1)', exitCode: 1 })).toBe(false);
        expect(isMissingPython({ ok: true, error: '' })).toBe(false);
    });

    test('the executable name is the one each platform actually ships', () => {
        expect(pythonExecutable()).toBe(process.platform === 'win32' ? 'python' : 'python3');
    });

    for (const tool of ['OrionBusinessFoundationTool', 'EnterprisePlatformFoundationTool']) {
        test(`${tool} reports SKIPPED rather than inventing a failure`, () => {
            const text = source(`modules/tools/definitions/${tool}.ts`);
            expect(text).toContain("from '../../../core/quality/python-runtime'");
            expect(text).toMatch(/skipped \(python not installed\)/);
            expect(text).toContain('acceptanceRan');
            expect(text).toContain('acceptanceCommand');
        });

        test(`${tool} marks a genuine verification failure as final evidence`, () => {
            expect(source(`modules/tools/definitions/${tool}.ts`)).toContain('verificationFailed: !verified');
        });

        /**
         * RESTORED, AND WIDER THAN THE GUARD THAT WAS REMOVED.
         *
         * The original assertion banned one spelling —
         * `executionEngine.runArgv(python…)` — and was dropped when this file
         * was rewritten, leaving nothing to stop a future edit from spawning
         * the interpreter directly again and losing the skip/fail distinction
         * with it. Pinning a spelling was always the weak part: the same
         * mistake wearing a different variable name would have sailed past.
         *
         * What actually matters is that these tools own no interpreter name
         * of their own. `pythonExecutable()` is the single place that knows
         * `python` on Windows and `python3` everywhere else — so the platform
         * split must not be re-derived here, in either direction.
         */
        test(`${tool} never spawns an interpreter of its own`, () => {
            const text = source(`modules/tools/definitions/${tool}.ts`);
            // No direct execution engine call carrying an interpreter.
            expect(text).not.toMatch(/executionEngine\.runArgv\(\s*(?:python|pythonExecutable|'python)/);
            // …and no second copy of the platform decision.
            expect(text).not.toMatch(/process\.platform === 'win32' \? 'python'/);
            expect(text).toContain('pythonExecutable()');
        });
    }

    test('the shared pipeline discovers first and propagates verification evidence', () => {
        const pipeline = source('modules/tools/definitions/ProjectPipelineTool.ts');
        // Repointed: the pipeline now forwards the project root a caller may
        // supply, so the literal call text changed. The guarantee is unchanged —
        // discovery is still the first thing that runs.
        expect(pipeline).toContain("executeTool('engineering_discovery',");
        expect(pipeline).toContain('projectPath ? { request: productRequest, path: projectPath } : { request: productRequest }');
        expect(pipeline).toContain('const requestFidelityMismatch = hasRequestFidelityMismatch(pipeline?.results)');
        expect(pipeline).toContain('const verificationFailed = requestFidelityMismatch || (Array.isArray(pipeline?.results)');
        expect(pipeline).toContain('...(verificationFailed ? { verificationFailed: true } : {})');
        expect(pipeline).toContain('evidence is incomplete — blocking writes honestly');
    });

    test('the orchestrator reads a final verification marker before recovery', () => {
        expect(source('orchestration/AgentOrchestrator.ts')).toContain('out.verificationFailed === true');
    });
});

describe('the foundation generator remains independently testable', () => {
    test('its acceptance suite locates its own source without an environment variable', async () => {
        const { OrionBusinessFoundationTool } = await import('../modules/tools/definitions/OrionBusinessFoundationTool');
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-foundation-skip-'));
        try {
            const result: any = await new OrionBusinessFoundationTool().execute(
                { request: 'Build a multi-tenant business system with RBAC, inventory, orders and approvals' },
                { workspaceRoot: root, sessionId: 'foundation-defect-test', language: 'en' },
            );
            expect(result.ok).toBe(true);
            expect(result.output.verificationFailed).toBe(false);
            expect(result.output.acceptanceRan).toBe(true);
            expect(result.output.acceptanceCommand).toContain('unittest discover -s tests');
            const suite = fs.readFileSync(path.join(result.output.projectPath, 'tests', 'test_orion_acceptance.py'), 'utf8');
            expect(suite).toContain('CORE_ROOT');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 60_000);
});
