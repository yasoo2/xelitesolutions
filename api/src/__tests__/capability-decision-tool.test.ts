import { CapabilityDecisionTool } from '../modules/tools/definitions/CapabilityDecisionTool';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { capabilityRoute } from '../core/orchestrator/toolCatalog';

describe('capability decision tool', () => {
    it('returns a local no-setup receipt for an offline OCR request', async () => {
        const result: any = await new CapabilityDecisionTool().execute({ request: 'Choose the least setup route for offline OCR.', offline: true, privacy: 'LOCAL_ONLY', requireProvenReliability: true });
        expect(result.ok).toBe(true);
        expect(result.output.receipt.selected).toMatchObject({ id: 'ocr-local', route: 'local' });
        expect(result.output.userAction).toBeUndefined();
        expect(result.output.receipt.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'ocr-key-service' })]));
    });

    it('asks for exactly one connection action only when external deployment rules it in', async () => {
        const result: any = await new CapabilityDecisionTool().execute({ request: 'Choose a storage route for deployed uploads.', deployment: true });
        expect(result.ok).toBe(true);
        expect(result.output.receipt.selected).toMatchObject({ id: 'storage-connect', route: 'account_connection' });
        expect(result.output.userAction).toBe('CONNECT_ACCOUNT');
    });

    it('derives an explicit deployment constraint from an ordinary route-choice request', async () => {
        const result: any = await new CapabilityDecisionTool().execute({ request: 'Choose the least-setup route for deployed file storage.' });
        expect(result.ok).toBe(true);
        expect(result.output.receipt.selected).toMatchObject({ id: 'storage-connect', route: 'account_connection' });
        expect(result.output.userAction).toBe('CONNECT_ACCOUNT');
    });

    it('stops honestly when the request names no supported general capability', async () => {
        await expect(new CapabilityDecisionTool().execute({ request: 'Build an invoice editor.' }))
            .resolves.toMatchObject({ ok: false, error: 'unsupported_capability_family' });
    });

    it('is discoverable by the deterministic planner router from a decision request', () => {
        const route = capabilityRoute('اختر أقل إعداد لأداة OCR تعمل دون إنترنت');
        expect(route).toMatchObject({ tool: 'decide_capability_route' });
        expect(route?.input.request).toContain('OCR');
    });

    it('plans a single safe decision step instead of treating an unseen request as a build', async () => {
        const plan: any = await PlanningEngine.generatePlan({
            intent: { goal: 'Choose the least-setup safe route for offline OCR.', complexity: 'low', riskLevel: 'low', rawIntent: {} } as any,
        });
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({ tool: 'decide_capability_route' });
        expect(plan.steps[0].input.request).toContain('offline OCR');
    });
});
