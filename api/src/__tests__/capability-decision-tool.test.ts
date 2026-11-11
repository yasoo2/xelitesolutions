import { CapabilityDecisionTool } from '../modules/tools/definitions/CapabilityDecisionTool';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { capabilityRoute } from '../core/orchestrator/toolCatalog';
import { capabilityProfilesFor } from '../core/capabilities/decision-profiles';

/**
 *  THE CATALOGUE'S EVIDENCE HAS A DATE, AND THE DATE MOVES AWAY.
 *
 *  Joe's built-in routes carry `evidenceCheckedAt` and a claim older than
 *  seven days is treated as stale. This file asserted the in-window answer
 *  with the real clock, so it was green on the day it was written
 *  (2026-09-23) and red from 2026-09-29 on, with no code change at all.
 *
 *  The clock is now an input, read from the catalogue's own evidence date
 *  rather than spelled here, and BOTH sides are asserted: inside the window
 *  the proven local route is chosen; past it, the same request refuses to
 *  call stale evidence proven.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const ocrEvidenceAt = () => Date.parse(String(capabilityProfilesFor('ocr').find(c => c.id === 'ocr-local')?.evidenceCheckedAt || ''));
const offlineOcr = { request: 'Choose the least setup route for offline OCR.', offline: true, privacy: 'LOCAL_ONLY', requireProvenReliability: true };

describe('capability decision tool', () => {
    afterEach(() => jest.useRealTimers());

    it('returns a local no-setup receipt for an offline OCR request while its evidence is fresh', async () => {
        expect(Number.isFinite(ocrEvidenceAt())).toBe(true);
        jest.useFakeTimers({ now: ocrEvidenceAt() + DAY_MS });
        const result: any = await new CapabilityDecisionTool().execute(offlineOcr);
        expect(result.ok).toBe(true);
        expect(result.output.receipt.selected).toMatchObject({ id: 'ocr-local', route: 'local' });
        expect(result.output.receipt.evidenceFreshness).toBe('fresh');
        expect(result.output.userAction).toBeUndefined();
        expect(result.output.receipt.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'ocr-key-service' })]));
    });

    it('NEGATIVE — once that evidence is past its window, the same request does not call it proven', async () => {
        jest.useFakeTimers({ now: ocrEvidenceAt() + 8 * DAY_MS });
        const result: any = await new CapabilityDecisionTool().execute(offlineOcr);
        expect(result).toMatchObject({ ok: false, error: 'no_safe_capability_route' });
        expect(result.output.receipt.selected).toBeNull();
        expect(result.output.receipt.rejected).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'ocr-local', reasons: expect.arrayContaining(['reliability is stale, not proven']) }),
        ]));
    });

    it('routes public data through a provider-neutral decision before provider discovery', async () => {
        const result: any = await new CapabilityDecisionTool().execute({ request: 'Choose the least-setup safe route for a weather dashboard.' });
        expect(result).toMatchObject({ ok: true, output: { receipt: { family: 'public_data', selected: { route: 'public_api', setup: 'ZERO_SETUP' } } } });
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
