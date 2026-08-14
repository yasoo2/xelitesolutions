/**
 * WHAT THE ORION COMMIT GOT WRONG — MEASURED, NOT ASSERTED.
 *
 * `bd5085f` added a real, well-built thing: a Python stdlib business core
 * that proves tenant isolation, an approval gate before payment, inventory
 * movement, a ledger entry, audit records and a versioned event — and,
 * unlike the commit before it, its generated test locates its own source
 * instead of assuming an environment variable. Its own suite is green.
 *
 * Three defects survived that suite, for one reason each:
 *
 *   1. `tsc` was never run. Two new plan-metadata fields went red under
 *      `npx tsc --noEmit` while all 2870 Jest tests passed, because
 *      ts-jest runs with `diagnostics: false` and esbuild does not
 *      typecheck. This is the second commit in a row to land the same way.
 *
 *   2. The route was matched by BUSINESS NOUNS, not by the product's name,
 *      so a restaurant site and a plain CRM request were both pulled into
 *      a folder called `orion-business-operating-system`.
 *
 *   3. A machine with no Python made the tool report the generated code as
 *      broken — and returned a bare `ok:false`, which the orchestrator
 *      hands to recovery for an LLM to retry an interpreter into existence.
 *
 * These tests exist so the third commit does not repeat them.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { isOrionBusinessOperatingSystemRequest } from '../modules/tools/definitions/ProjectPipelineTool';
import { isMissingPython, pythonExecutable } from '../core/quality/python-runtime';

const source = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('the ORION route is chosen by the name he gave it, not by business nouns', () => {
    test('a named ORION business request still routes', () => {
        expect(isOrionBusinessOperatingSystemRequest(
            'Build ORION, a multi-tenant business operating system with RBAC, CRM, inventory and approvals',
        )).toBe(true);
        expect(isOrionBusinessOperatingSystemRequest(
            'Build ORION with tenant isolation, orders, billing and an audit trail',
        )).toBe(true);
    });

    test('an Arabic ORION request is no longer dropped after the planner routes it here', () => {
        // The planner gate upstream accepts «ابنِ ORION …»; this predicate used
        // to answer false immediately afterwards, so the request fell through
        // to a builder that had never heard of ORION.
        expect(isOrionBusinessOperatingSystemRequest(
            'ابنِ ORION — نظام أعمال متعدد المستأجرين فيه مخزون وطلبات وموافقات',
        )).toBe(true);
    });

    test('unnamed business requests go back to the builders that were always right for them', () => {
        for (const stolen of [
            'Build a restaurant system with a menu, orders and an audit of every change',
            'I need an enterprise system for CRM, billing and inventory with an approval workflow',
            'Build a business platform with multi-tenant RBAC, orders, inventory, approvals and audit',
        ]) {
            expect(isOrionBusinessOperatingSystemRequest(stolen)).toBe(false);
        }
    });

    test('and the requests it never touched stay untouched', () => {
        expect(isOrionBusinessOperatingSystemRequest('Build a Fortune 500 multi-agent engineering platform with Kubernetes and Kafka.')).toBe(false);
        expect(isOrionBusinessOperatingSystemRequest('Build a small React task tracker.')).toBe(false);
        expect(isOrionBusinessOperatingSystemRequest('')).toBe(false);
    });

    test('the bare name is not enough — Orion is also a constellation, a car and a browser', () => {
        expect(isOrionBusinessOperatingSystemRequest('Make me a landing page about the Orion nebula')).toBe(false);
    });
});

describe('a plan may declare what it is, and the compiler must agree', () => {
    test('the ORION plan metadata fields are declared on ExecutionPlan, not smuggled past tsc', () => {
        const planner = source('core/orchestrator/PlanningEngine.ts');
        const iface = planner.slice(planner.indexOf('export interface ExecutionPlan'), planner.indexOf('export class PlanningEngine'));
        expect(iface).toMatch(/deterministic\?: boolean;/);
        expect(iface).toMatch(/localOnly\?: boolean;/);
    });

    test('the plan that sets them is still the ORION plan', () => {
        const planner = source('core/orchestrator/PlanningEngine.ts');
        expect(planner).toContain('deterministic: true, localOnly: true');
    });
});

describe('a missing interpreter is a skipped check, never a failed one', () => {
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
            // The old shape: three doomed spawns and a verdict built from ok flags alone.
            expect(text).not.toMatch(/executionEngine\.runArgv\((?:python|pythonExecutable)/);
            expect(text).toContain('acceptanceRan');
            expect(text).toContain('acceptanceCommand');
        });

        test(`${tool} marks a genuine verification failure as final evidence`, () => {
            expect(source(`modules/tools/definitions/${tool}.ts`)).toContain('verificationFailed: !verified');
        });
    }

    test('the pipeline never prints a ✅ for something it did not measure', () => {
        const pipeline = source('modules/tools/definitions/ProjectPipelineTool.ts');
        expect(pipeline).toContain('output.acceptanceRan === false');
        expect(pipeline).toMatch(/acceptance skipped \(python not installed\)/);
        expect(pipeline).toMatch(/contract tests skipped \(python not installed\)/);
        expect(pipeline).toContain('verificationFailed: !verified');
    });

    test('the orchestrator is the one that reads that marker', () => {
        expect(source('orchestration/AgentOrchestrator.ts')).toContain('out.verificationFailed === true');
    });
});

describe('the ORION foundation still does what it was built to do', () => {
    test('the acceptance suite it writes locates its own source, needing no environment variable', async () => {
        const { OrionBusinessFoundationTool } = await import('../modules/tools/definitions/OrionBusinessFoundationTool');
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-orion-skip-'));
        try {
            const result: any = await new OrionBusinessFoundationTool().execute(
                { request: 'Build ORION, a multi-tenant business operating system with RBAC, inventory, orders and approvals' },
                { workspaceRoot: root, sessionId: 'orion-defect-test', language: 'en' },
            );
            expect(result.ok).toBe(true);
            expect(result.output.verificationFailed).toBe(false);
            // python3 exists here, so the acceptance suite really ran.
            expect(result.output.acceptanceRan).toBe(true);
            expect(result.output.acceptanceCommand).toContain('unittest discover -s tests');
            const suite = fs.readFileSync(path.join(result.output.projectPath, 'tests', 'test_orion_acceptance.py'), 'utf8');
            expect(suite).toContain('CORE_ROOT');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 60_000);
});
