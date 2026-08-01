/**
 * The canonical pipeline's self-fix brain now carries scar tissue:
 * - a cure is RECORDED only when the failed phase completes after the repair;
 * - a remembered cure rides into every matched plan as context;
 * - and the one case the rules abandon (manual_review) is rescued when the
 *   disease is one Joe already beat — one guided attempt instead of surrender.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const memDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selffix-mem-'));
process.env.JOE_MEMORY_DIR = memDir;

// Required AFTER the env is set: the repairMemory singleton captures its
// store directory at module load.
const { RepairMemory } = require('../core/memory/repair-memory');
const { SelfFixService } = require('../modules/services/SelfFixService');

function ticket(primaryError: string, severity = 'low', status = 'failed') {
    return {
        type: 'phase_repair_ticket',
        projectName: 'p', phaseNumber: 1, phaseName: 'ph', status,
        severity,
        primaryError,
        failedTasks: [{ task: 't', tool: 'shell_execute', error: primaryError }],
        suggestedNextAction: '', retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
        context: {}, createdAt: new Date().toISOString(),
    } as any;
}

afterAll(() => fs.rmSync(memDir, { recursive: true, force: true }));

describe('self-fix + repair memory', () => {
    const strangeError = 'zorblex quantum flux misalignment in warp core';
    // status 'unknown': a real ticket whose status text ('failed'/'partial')
    // would satisfy the generic code_fix rule — the rescue exists for the
    // statuses that don't.
    test('unknown disease, empty memory → honest manual_review stop', () => {
        const plan = SelfFixService.plan(ticket(strangeError, 'low', 'unknown'));
        expect(plan.allowed).toBe(false);
        expect(plan.strategy).toBe('manual_review');
    });

    test('the rescue: same unknown disease, but a proven cure exists → one guided attempt', async () => {
        const mem = new RepairMemory(memDir);
        await mem.recordRepair(strangeError, 'code_fix via ai_write_file (realign the flux capacitor)');

        const plan = SelfFixService.plan(ticket(strangeError, 'low', 'unknown'));
        expect(plan.allowed).toBe(true);
        expect(plan.strategy).toBe('code_fix');
        expect(plan.maxAttempts).toBe(1); // the safety law holds even for memory
        expect(plan.reason).toMatch(/cured before/);
        expect(String(plan.suggestedInput?.description)).toContain('PROVEN PAST CURE');
        expect(String(plan.suggestedInput?.description)).toContain('realign the flux capacitor');
    });

    test('a realistic failed-status ticket: the generic rule fires WITH the cure in its description', async () => {
        const mem = new RepairMemory(memDir);
        await mem.recordRepair(strangeError, 'code_fix via ai_write_file (realign the flux capacitor)');

        const plan = SelfFixService.plan(ticket(strangeError)); // status 'failed'
        expect(plan.allowed).toBe(true);
        expect(plan.strategy).toBe('code_fix');
        expect(String(plan.suggestedInput?.description)).toContain('realign the flux capacitor');
    });

    test('rules stay in charge when they match — memory rides along as context', async () => {
        const depError = "Cannot find module 'left-pad'";
        const mem = new RepairMemory(memDir);
        await mem.recordRepair(depError, 'dependency_fix via shell_execute (npm install)');

        const plan = SelfFixService.plan(ticket(depError));
        expect(plan.strategy).toBe('dependency_fix');           // the RULE decided
        expect(plan.suggestedTool).toBe('shell_execute');
        expect(String(plan.rememberedCure)).toContain('npm install'); // memory attached
    });

    test('critical severity stops even when a cure is remembered — safety outranks memory', async () => {
        const secError = 'unauthorized token leak detected in zorblex pipeline';
        const mem = new RepairMemory(memDir);
        await mem.recordRepair(secError, 'some past cure');

        const plan = SelfFixService.plan(ticket(secError, 'critical'));
        expect(plan.allowed).toBe(false);
        expect(plan.strategy).toBe('permission_stop');
    });
});

describe('recording — the cure is remembered only when PROVEN', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'services', 'SelfFixExecutionService.ts'), 'utf-8');

    test('recordRepair fires only inside the rerunPassed branch', () => {
        const at = src.indexOf('repairMemory.recordRepair');
        expect(at).toBeGreaterThan(0);
        const before = src.slice(Math.max(0, at - 500), at);
        expect(before).toContain('if (rerunPassed)');
    });

    test('a memory write failure can never break the pipeline', () => {
        expect(src).toMatch(/\.catch\(\(e\) => console\.warn\('\[RepairMemory\] record failed:/);
    });
});
