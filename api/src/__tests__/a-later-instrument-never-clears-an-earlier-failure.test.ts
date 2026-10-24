import fs from 'fs';
import path from 'path';
import {
    DeliveryLedger,
    browserQaTargetUrl,
    deliveryVerdict,
    mayRunBrowserQa,
    verifiedLiveUrl,
    type DeliveryMeasurement,
} from '../core/quality/delivery-verdict';

/**
 * Round 15 adversarial review: project_pipeline let the LAST instrument
 * decide. When visible Browser QA passed it wrote
 * `finalVerified = !scopeCoverageFailed` and cleared the live error, erasing a
 * failed quality contract measured a moment earlier (the failed contract kept
 * the live URL, so Browser QA ran on it). A failed pipeline could even be
 * "verified" on the durable preview URL, which replaced an empty live URL.
 */
const live = (ok = true): DeliveryMeasurement => ({ instrument: 'live', ok, url: ok ? 'http://127.0.0.1:4868/' : '', error: ok ? undefined : 'project_run did not confirm a live URL' });
const ok = (verdict: ReturnType<typeof deliveryVerdict>) => verdict.verified || verdict.partial;

describe('the verdict is made from every measurement', () => {
    it('a failed quality contract stands after Browser QA scores 100', () => {
        const v = deliveryVerdict({
            phaseVerified: true, requestFidelityBlocked: false, required: ['browser'],
            measurements: [live(), { instrument: 'quality', ok: false, error: 'project quality contract failed — test script is a placeholder' }, { instrument: 'scope', ok: true }, { instrument: 'browser', ok: true }],
        });
        expect(v.verified).toBe(false);
        expect(ok(v)).toBe(false);
        expect(v.firstError).toMatch(/quality contract/);
    });

    it('a failed pipeline is not delivered by a passing durable-preview Browser QA', () => {
        const v = deliveryVerdict({
            phaseVerified: false, requestFidelityBlocked: false,
            measurements: [{ instrument: 'browser', ok: true }],
        });
        expect(ok(v)).toBe(false);
        // …and the preview cannot even become the QA target without a confirmed live run.
        expect(browserQaTargetUrl('', 'http://localhost:5047/project-preview/s1/')).toBe('');
        expect(browserQaTargetUrl('http://127.0.0.1:4868/', 'http://localhost:5047/project-preview/s1/')).toBe('http://localhost:5047/project-preview/s1/');
        expect(browserQaTargetUrl('http://127.0.0.1:4868/', '')).toBe('http://127.0.0.1:4868/');
    });

    it('everything measured and passing is delivered; one missing required instrument is not', () => {
        const all = [live(), { instrument: 'quality', ok: true }, { instrument: 'scope', ok: true }, { instrument: 'browser', ok: true }] as DeliveryMeasurement[];
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: all, required: ['browser'] }).verified).toBe(true);
        const noBrowser = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: all.slice(0, 3), required: ['browser'] });
        expect(noBrowser.verified).toBe(false);
        expect(noBrowser.unmeasured).toEqual(['browser']);
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: true, measurements: all }).verified).toBe(false);
    });

    it('partial rides only on a scope-only shape with Browser QA clean', () => {
        const scopeOnly = [live(), { instrument: 'quality', ok: true }, { instrument: 'scope', ok: false, error: 'missing: kanban' }] as DeliveryMeasurement[];
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: [...scopeOnly, { instrument: 'browser', ok: true }], required: ['browser'] }).partial).toBe(true);
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: scopeOnly, required: ['browser'] }).partial).toBe(false);
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: [...scopeOnly, { instrument: 'browser', ok: false, error: '2 findings' }], required: ['browser'] }).partial).toBe(false);
        // Missing requested records never ride the partial shape.
        const records = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, required: ['browser'],
            measurements: [...scopeOnly, { instrument: 'coverage', ok: false, error: 'requested_entities_not_delivered: patients' }, { instrument: 'browser', ok: true }] });
        expect(records.partial).toBe(false);
        expect(records.coverageFailed).toBe(true);
    });

    it('unread requested items leave the delivery not verified — never delivered, never failed', () => {
        const v = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false,
            measurements: [live(), { instrument: 'quality', ok: true }, { instrument: 'coverage', ok: true, unread: ['audit logs'] }] });
        expect(v.verified).toBe(false);
        expect(v.failures).toEqual([]);
        expect(v.unread).toEqual(['audit logs']);
        expect(v.partial).toBe(false);
    });

    it('re-measuring the same instrument after a repair replaces it; another instrument never does', () => {
        const ledger = new DeliveryLedger();
        ledger.record(live(false));
        ledger.record({ instrument: 'browser', ok: true });
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: ledger.all() }).verified).toBe(false);
        ledger.record(live(true));
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: ledger.all() }).verified).toBe(true);
        expect(verifiedLiveUrl(ledger.all())).toBe('http://127.0.0.1:4868/');
        // Per-target measurements are kept apart.
        ledger.record({ instrument: 'coverage', ok: true, target: '/w/api' });
        ledger.record({ instrument: 'coverage', ok: false, target: '/w/other', error: 'x' });
        expect(ledger.all().filter(m => m.instrument === 'coverage')).toHaveLength(2);
    });
});

describe('Browser QA never runs to rescue a measured failure', () => {
    it('runs after a clean live run, quality and records — or a scope-only gap', () => {
        expect(mayRunBrowserQa([live(), { instrument: 'quality', ok: true }, { instrument: 'scope', ok: true }])).toBe(true);
        expect(mayRunBrowserQa([live(), { instrument: 'quality', ok: true }, { instrument: 'scope', ok: false }])).toBe(true);
    });
    it('does not run after a failed live run, quality contract or record coverage, or with no live run', () => {
        expect(mayRunBrowserQa([live(false)])).toBe(false);
        expect(mayRunBrowserQa([live(), { instrument: 'quality', ok: false }])).toBe(false);
        expect(mayRunBrowserQa([live(), { instrument: 'quality', ok: true }, { instrument: 'coverage', ok: false }])).toBe(false);
        expect(mayRunBrowserQa([])).toBe(false);
    });
});

describe('the pipeline is wired to the ledger', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
    it('a passing Browser QA records its own pass and assigns no verdict', () => {
        expect(src).not.toMatch(/finalVerified = !scopeCoverageFailed/);
        expect(src).toMatch(/browserQaFailed = false;[\s\S]{0,200}ledger\.record\(\{ instrument: 'browser', ok: true \}\);/);
        // finalVerified is assigned in exactly one place: the ledger sync.
        expect(src.match(/(?<!let )\bfinalVerified = /g)).toHaveLength(1);
        expect(src).toMatch(/finalVerified = verdict\.verified;/);
    });
    it('Browser QA is gated by the ledger and a durable preview only stands in for a confirmed live URL', () => {
        expect(src).toMatch(/const browserQaTarget = mayRunBrowserQa\(ledger\.all\(\)\)\s*\?\s*browserQaTargetUrl\(verifiedLiveUrl\(ledger\.all\(\)\), runtimeProjectHandoff\?\.durablePreviewUrl\)/);
        expect(src).not.toMatch(/liveUrl = finalBrowserQaUrl\(liveUrl/);
    });
    it('partial delivery and ok come from the final verdict', () => {
        expect(src).toMatch(/const partialDelivery = finalDeliveryVerdict\.partial;/);
        expect(src).toMatch(/ok: finalVerified \|\| partialDelivery,/);
    });
});
