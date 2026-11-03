/**
 * The error-recovery loop audit: when a step fails mid-build, Joe must read
 * the error, plan the repair FROM it, and retry — not skip it, not chat about
 * it, not re-run the identical failure. Four measured defects, four fixes:
 *
 * 1. attemptRecovery asked for "Fix and continue: <task>" WITHOUT the error —
 *    the planner repaired blind. The error text now rides in the goal.
 * 2. Recovery goals fell into keyword fast-paths: a short one (<30 chars)
 *    became a chat answer; one whose task said «ابحث» re-ran the same failing
 *    search. Recovery now bypasses every fast-path at the top of generatePlan.
 * 3. The planner prompt embedded JSON.stringify(fullHistory) unbounded — one
 *    page-builder result blew the token limit and the planning call itself
 *    died. History is now compacted: failures keep their error, successes a scent.
 * 4. sanitizeOutput DELETED stdout/stderr from recorded results, blinding every
 *    later step to what a command printed. It now truncates instead.
 */
import fs from 'fs';
import path from 'path';
import { compactHistoryForPrompt } from '../core/orchestrator/history-compact';

const orchSrc = fs.readFileSync(
    path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
const planSrc = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');

describe('1. the recovery goal carries the error text', () => {
    test('attemptRecovery builds the goal from task AND error', () => {
        expect(orchSrc).toMatch(/THE STEP FAILED WITH THIS ERROR/);
        expect(orchSrc).toMatch(/errorText\s*\?\s*`Fix and continue: \$\{failedNode\.task\}/);
        // The error is capped so a megabyte stack trace cannot flood the planner.
        expect(orchSrc).toMatch(/\.slice\(0, 1500\)/);
    });

    test('the recovery prefix is preserved so the top-of-planner guard still fires', () => {
        // Both goal shapes begin with the exact prefix the guard tests for.
        const guard = /\^fix and continue:/i;
        expect(planSrc).toMatch(guard);
        expect('Fix and continue: run tests\n[THE STEP FAILED WITH THIS ERROR — read it and plan the repair around its cause]:\nENOENT')
            .toMatch(/^fix and continue:/i);
    });
});

describe('2. recovery goals bypass every fast-path', () => {
    test('the guard sits at the top of generatePlan, before any fast-path', () => {
        const guardAt = planSrc.indexOf('if (/^fix and continue:/i.test(String(intent.goal');
        const firstFastPath = planSrc.indexOf('[BUILD FAST-PATH]');
        expect(guardAt).toBeGreaterThan(0);
        expect(firstFastPath).toBeGreaterThan(guardAt);
        // And it routes straight to the real planner.
        const afterGuard = planSrc.slice(guardAt, guardAt + 400);
        expect(afterGuard).toContain('generateDynamicDag(intent, memory, context)');
    });

    test('no per-fast-path isRecoveryGoal patchwork remains (one guard, total coverage)', () => {
        expect(planSrc).not.toMatch(/!isRecoveryGoal &&/);
    });

    /**
     *  …ON EVERY ROAD A RECOVERY CAN TAKE.
     *
     *  The adaptive planner (1f94c928) moved these rules into its own prompt,
     *  and the planner's single-attempt fallback kept its prompt WITHOUT
     *  them — so a recovery that fell back re-planned blind. The rules now
     *  have one text and both prompts carry it; this reads both prompts.
     */
    test('the dynamic planner gets recovery-specific rules: diagnose before retry', () => {
        const adaptive = fs.readFileSync(
            path.join(__dirname, '..', 'core', 'orchestrator', 'adaptive-dag-planner.ts'), 'utf-8');
        const { FAILURE_RECOVERY_RULES } = require('../core/orchestrator/adaptive-dag-planner');
        expect(FAILURE_RECOVERY_RULES).toMatch(/FAILURE-RECOVERY plan/);
        expect(FAILURE_RECOVERY_RULES).toMatch(/NEVER just re-run the failed step unchanged/);
        expect(FAILURE_RECOVERY_RULES).toMatch(/diagnose -> repair -> re-run/);
        // The adaptive prompt, for a recovery goal.
        expect(adaptive).toMatch(/const recoveryRules = isRecovery \? `\s*\$\{FAILURE_RECOVERY_RULES\}/);
        expect(adaptive).toMatch(/\$\{recoveryRules\}\n\nGoal: \$\{intent\.goal\}/);
        // …and the fallback prompt, inside the same function that falls back.
        const dag = planSrc.slice(planSrc.indexOf('private static async generateDynamicDag('));
        const fallback = dag.slice(dag.indexOf('falling back to single attempt'), dag.indexOf('const response = await routeToModel('));
        expect(fallback).toMatch(/const recoveryRules = isRecovery \? `\\n\$\{FAILURE_RECOVERY_RULES\}` : ''/);
        expect(fallback).toMatch(/chosen\.\$\{recoveryRules\}\n\nGoal: \$\{intent\.goal\}/);
    });
});

describe('3. compactHistoryForPrompt — the planner reads a digest, not a dump', () => {
    const entry = (stepId: string, status: string, result: any) =>
        ({ stepId, action: `do ${stepId}`, status, result });

    test('a completed page-builder result (an entire HTML page) is cut to a scent', () => {
        const page = '<!doctype html>' + 'x'.repeat(300_000);
        const out = compactHistoryForPrompt([entry('build', 'completed', page)]);
        expect(JSON.stringify(out).length).toBeLessThan(2000);
        expect(out[0].result).toContain('…[truncated');
    });

    test('a failed step keeps far more of its error than a success keeps of its output', () => {
        const long = 'e'.repeat(10_000);
        const [failed] = compactHistoryForPrompt([entry('a', 'failed', long)]);
        const [okEntry] = compactHistoryForPrompt([entry('b', 'completed', long)]);
        expect(failed.result.length).toBeGreaterThan(okEntry.result.length);
        expect(failed.result.startsWith('e'.repeat(2000))).toBe(true);
    });

    test('only the recent tail survives, with an honest omission note', () => {
        const many = Array.from({ length: 30 }, (_, i) => entry(`s${i}`, 'completed', 'ok'));
        const out = compactHistoryForPrompt(many);
        expect(out.length).toBe(13); // 12 entries + note
        expect(out[0].note).toMatch(/18 earlier step\(s\) omitted/);
        expect(out[out.length - 1].stepId).toBe('s29');
    });

    test('object results are stringified, short ones pass untouched, non-arrays pass through', () => {
        const [o] = compactHistoryForPrompt([entry('x', 'completed', { exitCode: 0 })]);
        expect(o.result).toBe('{"exitCode":0}');
        expect(compactHistoryForPrompt('not an array' as any)).toBe('not an array');
    });

    test('the planner prompt actually uses it', () => {
        expect(planSrc).toMatch(/JSON\.stringify\(compactHistoryForPrompt\(memory\)\)/);
        expect(planSrc).not.toMatch(/JSON\.stringify\(memory\)/);
    });
});

describe('4. sanitizeOutput truncates instead of deleting', () => {
    test('stdout and stderr survive (capped), only the raw command is dropped', () => {
        expect(orchSrc).not.toMatch(/delete sanitized\.stdout/);
        expect(orchSrc).not.toMatch(/delete sanitized\.stderr/);
        expect(orchSrc).toMatch(/delete sanitized\.command/);
        expect(orchSrc).toMatch(/sanitized\.stdout\.slice\(0, 4000\)/);
        expect(orchSrc).toMatch(/sanitized\.stderr\.slice\(0, 2000\)/);
    });
});

describe('the retry ceiling still ends a hopeless loop', () => {
    /**
     *  The REAL error is now the measured payload of the failing node
     *  (902b9686: a short error code had been erasing the QA report it
     *  stood for). `lastNodeError` is set from that node's own result just
     *  before this branch, so it is still this failure — and the generic
     *  text stays last, reached only when nothing was measured.
     */
    test('two retries, then the REAL error surfaces', () => {
        const at = orchSrc.indexOf('if (currentRetryCount >= 2)');
        expect(at).toBeGreaterThan(-1);
        const ceiling = orchSrc.slice(at, orchSrc.indexOf('if (this.recoveriesUsed', at));
        expect(ceiling).toMatch(/return \{ ok: false, result: lastNodeError \?\? result\.error \?\? "Fatal execution error: Max retries reached"/);
        // …and lastNodeError is this node's failure, assigned before any branch reads it.
        const assigned = orchSrc.indexOf('lastNodeError = result.output ?? result.error ?? lastNodeError;');
        expect(assigned).toBeGreaterThan(-1);
        expect(assigned).toBeLessThan(at);
    });
});
