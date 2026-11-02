const mockCallLLM = jest.fn();

jest.mock('../core/llm', () => ({
    callLLM: (...args: any[]) => mockCallLLM(...args),
}));

import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import {
    LARGE_REQUEST_MAX_CHARS,
    LargeRequestRejectedError,
    countRequestChars,
    requestTextForPrompt,
    transportRequestText,
    truncateAuxiliaryText,
} from '../core/orchestrator/large-request-contract';

const TAIL_EN = 'TAIL-MARKER-EN-7741: offline ledger export with QR verification';
const TAIL_AR = 'TAIL-MARKER-AR-7741: تصدير الدفاتر دون اتصال مع التحقق عبر رمز QR';

function buildRepairBrief(lang: 'en' | 'ar', tail: string): string {
    const head = lang === 'en'
        ? 'Repair the existing inventory application after a launchability failure. Preserve every working behavior.\n'
        : 'أصلح تطبيق المخزون الحالي بعد فشل التشغيل. حافظ على كل سلوك يعمل.\n';
    const pad = lang === 'en'
        ? 'Background domain context describing warehouses, suppliers, stock movements, and daily reconciliation reports. '
        : 'سياق خلفية يصف المستودعات والموردين وحركات المخزون وتقارير التسوية اليومية. ';
    let brief = head;
    while (brief.length < 6500) brief += pad;
    return `${brief}\nFINAL REQUIREMENT ${tail}\nCANCELLATION DIRECTIVE: stop after the bounded repair, do not redesign.\nEXPLICIT ROUTE: use local-only execution.\n`;
}

function buildNumberedBrief(): { brief: string; lastItem: string } {
    const lastItem = 'Offline ledger export with QR verification TAIL-ITEM-9';
    const items: string[] = [];
    for (let index = 1; index <= 8; index++) {
        items.push(`${index}. Requirement area ${index} ${'with detailed acceptance context for warehouses and suppliers. '.repeat(12)}`);
    }
    items.push(`9. ${lastItem}`);
    return { brief: `Build a production-grade inventory platform.\n\n${items.join('\n\n')}\n`, lastItem };
}

describe('large-request-contract transport unit', () => {
    it('admits a small request verbatim', () => {
        const result = transportRequestText('Build a compact expense tracker.');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.text).toBe('Build a compact expense tracker.');
            expect(result.chars).toBe('Build a compact expense tracker.'.length);
        }
    });

    it('admits a >5000-character English brief complete with its tail', () => {
        const brief = buildRepairBrief('en', TAIL_EN);
        expect(brief.length).toBeGreaterThan(5000);
        const result = transportRequestText(brief);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.text).toBe(brief);
            expect(result.text).toContain(TAIL_EN);
        }
    });

    it('counts Unicode code points, not UTF-16 units', () => {
        expect(countRequestChars('a👍b')).toBe(3);
        expect(countRequestChars('مخزون')).toBe(5);
        // 3000 emoji = 6000 UTF-16 units but only 3000 characters: admittable.
        expect(transportRequestText('👍'.repeat(3000)).ok).toBe(true);
    });

    it('rejects invalid inputs explicitly', () => {
        for (const bad of [undefined, null, 123, {}, '', '   ']) {
            const result = transportRequestText(bad);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.code).toBe('large_request_invalid');
        }
    });

    it('rejects oversize English and Arabic requests honestly instead of truncating', () => {
        const overEn = transportRequestText('x'.repeat(LARGE_REQUEST_MAX_CHARS + 1));
        expect(overEn.ok).toBe(false);
        if (!overEn.ok) {
            expect(overEn.code).toBe('large_request_over_bound');
            expect(overEn.error).toMatch(/too large/);
            expect(overEn.error).toContain(String(LARGE_REQUEST_MAX_CHARS));
        }
        const overAr = transportRequestText('ع'.repeat(LARGE_REQUEST_MAX_CHARS + 1));
        expect(overAr.ok).toBe(false);
        if (!overAr.ok) expect(overAr.code).toBe('large_request_over_bound');
        expect(transportRequestText('x'.repeat(LARGE_REQUEST_MAX_CHARS)).ok).toBe(true);
    });

    it('embeds verbatim or throws a typed rejection, never a silent slice', () => {
        expect(requestTextForPrompt('small request')).toBe('small request');
        const brief = buildRepairBrief('en', TAIL_EN);
        expect(requestTextForPrompt(brief)).toBe(brief);
        let thrown: unknown = null;
        try {
            requestTextForPrompt('x'.repeat(LARGE_REQUEST_MAX_CHARS + 1));
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(LargeRequestRejectedError);
        expect((thrown as LargeRequestRejectedError).code).toBe('large_request_over_bound');
    });

    it('keeps auxiliary text byte-identical below the cap and marks truncation above it', () => {
        expect(truncateAuxiliaryText('abc', 10)).toBe('abc');
        expect(truncateAuxiliaryText('0123456789', 10)).toBe('0123456789');
        const cut = truncateAuxiliaryText('0123456789ABCDEF', 10);
        expect(cut.startsWith('0123456789')).toBe(true);
        expect(cut).toMatch(/truncated/);
        expect(cut).not.toContain('ABCDEF');
    });
});

describe('large request fidelity during planner recovery', () => {
    beforeEach(() => mockCallLLM.mockReset());

    it('preserves the tail of a >5000-character English brief in the live-repair recovery prompt', () => {
        const brief = buildRepairBrief('en', TAIL_EN);
        expect(brief.length).toBeGreaterThan(5000);
        const prompt = (new ProjectPlannerTool() as any).createCompactRecoveryPlanningPrompt(
            brief,
            'missing_runnable_contract: package.json or the existing entrypoint must be repaired',
            undefined,
            true,
            false,
            [],
            undefined,
        );
        expect(prompt).toContain(TAIL_EN);
        expect(prompt).toContain('CANCELLATION DIRECTIVE');
        expect(prompt).toContain('EXPLICIT ROUTE');
    });

    it('preserves the tail of a >5000-character Arabic brief in the quality-repair recovery prompt', () => {
        const brief = buildRepairBrief('ar', TAIL_AR);
        expect(brief.length).toBeGreaterThan(5000);
        const prompt = (new ProjectPlannerTool() as any).createCompactRecoveryPlanningPrompt(
            brief,
            'project quality contract: missing test script for the existing project',
            undefined,
            true,
            false,
            [],
            undefined,
        );
        expect(prompt).toContain(TAIL_AR);
    });

    it('marks truncated failure evidence instead of dropping it silently', () => {
        const prompt = (new ProjectPlannerTool() as any).createCompactRecoveryPlanningPrompt(
            'Repair the existing application after a launchability failure.',
            `missing_runnable_contract: ${'failure detail '.repeat(200)}`,
            undefined,
            true,
            false,
            [],
            undefined,
        );
        expect(prompt).toMatch(/truncated/);
    });

    it('keeps the LAST numbered requirement of a large brief in the generic recovery register', () => {
        const { brief, lastItem } = buildNumberedBrief();
        expect(brief.length).toBeGreaterThan(5000);
        const prompt = (new ProjectPlannerTool() as any).createCompactRecoveryPlanningPrompt(
            brief,
            'truncated JSON output',
            undefined,
            false,
            false,
            [],
            undefined,
        );
        expect(prompt).toContain('TAIL-ITEM-9');
        expect(prompt).toContain(lastItem.slice(0, 40));
    });

    it('keeps the small-request primary prompt contract verbatim', () => {
        const brief = 'Create a compact expense tracker web application with an amount and category form.';
        const prompt = (new ProjectPlannerTool() as any).createPlanningPrompt(brief);
        expect(prompt).toContain(brief);
    });

    it.each(['en', 'ar'] as const)('preserves every constraint in all recovery branches (%s)', (language) => {
        const tail = language === 'en'
            ? 'Exact remaining constraint: use only node:test; write tests/amounts.test.js; cancel before effects when stopped.'
            : 'شرط أخير كامل: استخدم node:test فقط، واحفظ tests/amounts.test.js، وألغ التنفيذ قبل أي تغيير عند الإيقاف.';
        const brief = `${language === 'en' ? 'Build a ledger.' : 'أنشئ دفتر حسابات.'}\n${'Detailed requirement context. '.repeat(240)}\n${tail}`;
        const scenarios: Array<[string, boolean, boolean, string[], string]> = [
            ['truncated JSON output', false, false, [], 'COMPACT PLANNER RECOVERY'],
            ['missing required implementation capability', false, true, ['decimal validation'], 'BOUNDED SCOPE-REPAIR'],
            ['local runtime imports missing (server/index.js -> ./routes/authRoutes)', true, false, [], 'BOUNDED RUNTIME-IMPORT REPAIR'],
            ['missing_runnable_contract: existing entrypoint missing', true, false, [], 'BOUNDED LIVE-REPAIR'],
        ];
        for (const [failure, repair, scopeRepair, targets, branch] of scenarios) {
            const prompt = (new ProjectPlannerTool() as any).createCompactRecoveryPlanningPrompt(
                brief, failure, undefined, repair, scopeRepair, targets, undefined,
            );
            expect(prompt).toContain(brief);
            expect(prompt).toContain(tail);
            expect(prompt).toContain(branch);
        }
    });

    it('marks an incomplete actual discovery payload without claiming it is complete', () => {
        const evidence: any = {
            mode: 'existing_workspace', workspaceRoot: '/fixture',
            selectedProject: { root: '.', manifests: [], likelyEntrypoints: [], sourceFiles: Array.from({ length: 700 }, (_, i) => `src/component-${i}.ts`), testFiles: [], candidateChecks: [] },
            referenceProjects: [], constraints: {}, facts: [], blockers: [], instructionFiles: [],
        };
        const prompt = (new ProjectPlannerTool() as any).createCompactRecoveryPlanningPrompt(
            'Repair the existing ledger application.', 'missing_runnable_contract', undefined, true, false, [], evidence,
        );
        expect(prompt).toContain('discovery evidence truncated');
        expect(prompt).toContain('not complete');
        expect(prompt).not.toContain('src/component-699.ts');
    });

    it.each([undefined, null, '', '   ', 123])('returns typed non-deliverable admission for invalid input %p', async (brief) => {
        const result: any = await new ProjectPlannerTool().execute({ projectDescription: brief } as any, {});
        expect(mockCallLLM).not.toHaveBeenCalled();
        expect(result.ok).toBe(false);
        expect(result.output?.blocker?.code).toBe('large_request_invalid');
        expect(result.output?.phases).toEqual([]);
        expect(result.output?.deliveryStatus).toBe('blocked');
        expect(result.output?.executionStatus).toBe('not_started');
        expect(result.output?.verificationStatus).toBe('not_run');
    });

    it('rejects an oversize request honestly without calling the provider', async () => {
        mockCallLLM.mockResolvedValue(JSON.stringify({
            projectName: 'oversize',
            projectVibe: 'should never be reached',
            totalPhases: 1,
            estimatedDuration: 'short',
            dependencies: {},
            phases: [],
        }));
        const brief = `Build a production-grade platform.\n${'Requirement context line with concrete detail. '.repeat(4000)}\n`;
        expect(brief.length).toBeGreaterThan(LARGE_REQUEST_MAX_CHARS);
        const result: any = await new ProjectPlannerTool().execute({ projectDescription: brief } as any, {});
        expect(mockCallLLM).not.toHaveBeenCalled();
        expect(result.ok).toBe(false);
        expect(String(result.error || '')).toMatch(/too large|over.?bound|maximum/i);
        expect(result.output?.deliveryStatus).toBe('blocked');
        expect(result.output?.executionStatus).toBe('not_started');
        expect(result.output?.blocker?.code).toBe('large_request_over_bound');
        expect(result.output?.verificationStatus).toBe('not_run');
    });

    it('rejects invalid and empty requests without calling the provider', async () => {
        for (const bad of [123 as any, '' as any]) {
            mockCallLLM.mockClear();
            const result: any = await new ProjectPlannerTool().execute({ projectDescription: bad } as any, {});
            expect(mockCallLLM).not.toHaveBeenCalled();
            expect(result.ok).toBe(false);
            expect(String(result.error || '')).toMatch(/projectDescription/);
        }
    });
});
