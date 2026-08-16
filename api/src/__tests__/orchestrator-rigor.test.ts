/**
 * ORCHESTRATOR RIGOR — four diseases from one field log, each locked:
 *
 *   «central_answer was called without a question»          → plan sanity
 *   «Dynamic DAG generation failed: SyntaxError … position» → tolerant JSON
 *   the plan growing 5 → 9 → 12 → 13 nodes                  → recovery budget
 *   «⚠️ ENOENT: no such file or directory» as the reply      → humanized failure
 */
import fs from 'fs';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(),
    retryAfterMsFrom: jest.fn(() => null),
    customRouteCooldownUntil: new Map(),
    isProviderCoolingDown: jest.fn(() => false),
    markProviderFailed: jest.fn(),
}));

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('parseJsonArrayLoose — a broken character no longer kills the plan', () => {
    it('clean JSON parses as before', () => {
        expect(PlanningEngine.parseJsonArrayLoose('[{"id":"a","tool":"write_file"}]')).toEqual([{ id: 'a', tool: 'write_file' }]);
    });
    it('code fences and trailing commas are repaired', () => {
        const v = PlanningEngine.parseJsonArrayLoose('```json\n[{"id":"a",},{"id":"b"},]\n```');
        expect(v?.map((s: any) => s.id)).toEqual(['a', 'b']);
    });
    it('smart quotes from a weak model are normalized', () => {
        const v = PlanningEngine.parseJsonArrayLoose('[{“id”: “a”, “tool”: “central_answer”}]');
        expect(v?.[0]?.id).toBe('a');
    });
    it('the FIELD case: one corrupt node is dropped, the valid ones are salvaged', () => {
        // An unescaped quote breaks node 2 — exactly the class of the logged
        // «Expected ',' or '}' after property value» failure.
        const broken = '[{"id":"n1","tool":"write_file"},{"id":"n2","desc":"say "hello" now"},{"id":"n3","tool":"central_answer"}]';
        const v = PlanningEngine.parseJsonArrayLoose(broken);
        expect(v && v.length).toBeGreaterThanOrEqual(2);
        expect(v?.some((s: any) => s.id === 'n1')).toBe(true);
        expect(v?.some((s: any) => s.id === 'n3')).toBe(true);
    });
    it('pure prose (no array at all) still returns null → failover', () => {
        expect(PlanningEngine.parseJsonArrayLoose('sorry, I cannot help with that')).toBeNull();
    });
});

describe('sanitizeSteps — every step leaves planning runnable', () => {
    const goal = 'حلل هذه الصوره\n\n[ATTACHED FILES — the user attached 1 file(s)…]\nstuff';
    it('central_answer without a question gets the user goal as its question', () => {
        const [s] = PlanningEngine.sanitizeSteps([{ tool: 'central_answer', description: 'قارن المعلومات', input: {} } as any], goal);
        expect(String(s.input.question)).toContain('قارن المعلومات');
        expect(String(s.input.question)).toContain('حلل هذه الصوره');
        // The injected context is the USER'S words, not the injected blocks.
        expect(String(s.input.question)).not.toContain('ATTACHED FILES');
    });
    it('write_file without a path gets one instead of dying', () => {
        const [s] = PlanningEngine.sanitizeSteps([{ tool: 'write_file', description: 'اكتب النتائج', input: { content: 'x' } } as any], goal);
        expect(String(s.input.path)).toMatch(/joe-output-\d+\.txt/);
    });
    it('browser nodes without a task get the description', () => {
        const [s] = PlanningEngine.sanitizeSteps([{ tool: 'browser_run', description: 'افتح الموقع', input: {} } as any], goal);
        expect(s.input.task).toBe('افتح الموقع');
    });
    it('existing inputs are never overwritten', () => {
        const [s] = PlanningEngine.sanitizeSteps([{ tool: 'central_answer', description: 'x', input: { question: 'أصلي' } } as any], goal);
        expect(s.input.question).toBe('أصلي');
    });
});

describe('the run-level recovery budget and the humanized failure', () => {
    it('recoveries are capped per RUN, not only per node', () => {
        const src = read('orchestration', 'AgentOrchestrator.ts');
        expect(src).toContain('MAX_RECOVERIES_PER_RUN = 3');
        expect(src).toContain('recoveriesUsed >= MAX_RECOVERIES_PER_RUN');
        expect(src).toContain('this.recoveriesUsed++');
        expect(src).toContain('توقفت بصدق بدل الدوران في حلقة إصلاحات');
    });
    it('a raw system error reaches the user wrapped in a human sentence', () => {
        const { AgentLoopService } = require('../modules/services/AgentLoopService');
        const ar = AgentLoopService.humanizeFailure("ENOENT: no such file or directory, scandir 'C:\\x\\path_to_directory'", 'ar');
        expect(ar).toContain('تعذّر إكمال الطلب');
        expect(ar).toContain('ENOENT');            // honesty: the detail stays
        const en = AgentLoopService.humanizeFailure("'exiftool' is not recognized as an internal or external command", 'en');
        expect(en).toContain('Could not complete the request');
        // A normal (non-raw) failure message passes through untouched.
        expect(AgentLoopService.humanizeFailure('تعذر تنفيذ الخطوة الثالثة', 'ar')).toBe('تعذر تنفيذ الخطوة الثالثة');
    });

    it('does not spend decorative narration immediately before project planning', () => {
        const src = read('orchestration', 'AgentOrchestrator.ts');
        expect(src).toContain("narrationEnabled() && node.tool !== 'project_pipeline'");
        expect(src).toContain('project_pipeline owns its own evidence-first planning');
    });
});

describe('replanning preserves the original engineering goal', () => {
    it('never replans from a partial node task or DAG identifier when the user goal exists', () => {
        const src = read('orchestration', 'AgentOrchestrator.ts');
        expect(src).toContain('this.plan(goalText || dag.nodes[0]?.task || "continue goal", memory, traceId)');
        expect(src).toContain('this.plan(goalText || dag.id, memory, traceId)');
    });
});
