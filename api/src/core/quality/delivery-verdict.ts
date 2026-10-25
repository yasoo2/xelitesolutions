/**
 * ONE VERDICT, MADE FROM EVERY MEASUREMENT — NEVER FROM THE LAST ONE.
 *
 * Eval round 15 (adversarial review of the delivery gate): project_pipeline
 * decided delivery by whichever instrument ran last. When visible Browser QA
 * passed, it set `finalVerified = !scopeCoverageFailed` and cleared the live
 * error — erasing a quality-contract failure (a placeholder test script, a
 * missing build) measured a moment earlier, because the failed contract had
 * kept the live URL and Browser QA ran on it anyway. A failed pipeline could
 * even be "verified" by Browser QA on the durable preview URL, since that URL
 * replaced an empty live URL unconditionally.
 *
 * Here every instrument records its own measurement in a ledger. Re-measuring
 * the SAME instrument (after a bounded repair and restart) replaces its earlier
 * result; a DIFFERENT instrument can never clear another's failure. The verdict
 * is a pure function of the ledger.
 */

/** service: a request that needs a server got a delivered part that serves one (round 20). */
export type DeliveryInstrument = 'live' | 'quality' | 'scope' | 'coverage' | 'browser' | 'spec' | 'program' | 'service';

export interface DeliveryMeasurement {
    instrument: DeliveryInstrument;
    ok: boolean;
    /** Why it failed, in the instrument's own words. */
    error?: string;
    /** The delivered part (its root) this measured; '' for the delivery as a whole. */
    target?: string;
    /** coverage: requested items that could not be read — the delivery is then not verified, never delivered. */
    unread?: string[];
    /** live: the URL project_run confirmed. */
    url?: string;
}

/** Same instrument + same target → the newer measurement replaces the older one. */
export class DeliveryLedger {
    private readonly measurements: DeliveryMeasurement[] = [];

    record(measurement: DeliveryMeasurement): void {
        const target = String(measurement.target || '');
        const at = this.measurements.findIndex(m => m.instrument === measurement.instrument && String(m.target || '') === target);
        const clean = { ...measurement, target };
        if (at >= 0) this.measurements[at] = clean;
        else this.measurements.push(clean);
    }

    /** Forget an instrument entirely (e.g. a part that turned out not to exist). */
    forget(instrument: DeliveryInstrument): void {
        for (let i = this.measurements.length - 1; i >= 0; i--) {
            if (this.measurements[i].instrument === instrument) this.measurements.splice(i, 1);
        }
    }

    all(): DeliveryMeasurement[] {
        return this.measurements.map(m => ({ ...m }));
    }
}

export interface DeliveryVerdictInput {
    /** Every planned phase executed and verified. */
    phaseVerified: boolean;
    /** The built source does not match the requested engine, or its fidelity could not be checked. */
    requestFidelityBlocked: boolean;
    measurements: DeliveryMeasurement[];
    /** Instruments that must have a passing measurement (e.g. 'browser' when an interface is delivered). */
    required?: DeliveryInstrument[];
    /**
     * What proves the delivery runs: a confirmed live URL ('live'), or — for a
     * program the request asked for (a CLI, a script) — its own passing test
     * run ('program'). A program has no URL to confirm.
     */
    primary?: 'live' | 'program';
}

export interface DeliveryVerdict {
    verified: boolean;
    /** ok:true partial: live, quality and records proven, Browser QA clean, only named capabilities missing. */
    partial: boolean;
    /** Every failed measurement, in ledger order. */
    failures: DeliveryMeasurement[];
    /** Required instruments with no measurement at all. */
    unmeasured: DeliveryInstrument[];
    /** A requested record was measured missing — blocked, never partial. */
    coverageFailed: boolean;
    /** Requested items that could not be read — not verified, never delivered. */
    unread: string[];
    /** The first failure's error, by instrument priority. */
    firstError: string;
}

const PRIORITY: DeliveryInstrument[] = ['live', 'program', 'service', 'quality', 'coverage', 'scope', 'browser', 'spec'];

export function deliveryVerdict(input: DeliveryVerdictInput): DeliveryVerdict {
    const measurements = Array.isArray(input.measurements) ? input.measurements : [];
    const failures = measurements.filter(m => m.ok !== true);
    const has = (instrument: DeliveryInstrument) => measurements.some(m => m.instrument === instrument);
    const passed = (instrument: DeliveryInstrument) => has(instrument) && measurements.filter(m => m.instrument === instrument).every(m => m.ok === true);
    const required = Array.from(new Set<DeliveryInstrument>([input.primary === 'program' ? 'program' : 'live', ...(input.required || [])]));
    const unmeasured = required.filter(instrument => !has(instrument));
    const unread = Array.from(new Set(measurements.flatMap(m => m.instrument === 'coverage' ? (m.unread || []) : [])));
    const coverageFailed = failures.some(m => m.instrument === 'coverage');
    const base = input.phaseVerified === true && input.requestFidelityBlocked !== true;
    const verified = base && failures.length === 0 && unmeasured.length === 0 && unread.length === 0;
    // Partial rides only on the TaskFlow shape: everything measured passed except
    // named capability scope, and every required instrument — Browser QA among
    // them — measured clean. Missing records or unread items never ride it.
    const partial = !verified && base
        && failures.length > 0 && failures.every(m => m.instrument === 'scope')
        && unmeasured.length === 0 && unread.length === 0
        && required.every(instrument => instrument === 'scope' || passed(instrument));
    const firstFailure = PRIORITY.map(instrument => failures.find(m => m.instrument === instrument)).find(Boolean);
    return {
        verified,
        partial,
        failures,
        unmeasured,
        coverageFailed,
        unread,
        firstError: String(firstFailure?.error || (unmeasured.length ? `${unmeasured.join(', ')} not measured` : '')).trim(),
    };
}

/**
 * Visible Browser QA judges usability. It runs only when nothing it cannot
 * repair has already failed: the live run and the quality contract passed,
 * every requested record is served, and at most named capability scope is
 * missing (the partial shape it is asked to confirm). It never runs to
 * "rescue" an outcome already measured as failed.
 */
export function mayRunBrowserQa(measurements: DeliveryMeasurement[]): boolean {
    const list = Array.isArray(measurements) ? measurements : [];
    const live = list.filter(m => m.instrument === 'live');
    if (!live.length || live.some(m => m.ok !== true)) return false;
    return list.every(m => m.ok === true || m.instrument === 'scope' || m.instrument === 'browser');
}

/** The live URL a measurement confirmed, or ''. */
export function verifiedLiveUrl(measurements: DeliveryMeasurement[]): string {
    const live = (Array.isArray(measurements) ? measurements : []).filter(m => m.instrument === 'live' && m.ok === true);
    return String(live[live.length - 1]?.url || '').trim();
}

/**
 * The URL Browser QA opens. A durable preview may stand in for the live URL
 * only when the live run itself was confirmed — never for an empty one (a
 * failed or never-run pipeline must not be judged on a stale preview).
 */
export function browserQaTargetUrl(liveVerifiedUrl: unknown, durablePreviewUrl: unknown): string {
    const live = String(liveVerifiedUrl || '').trim();
    if (!live) return '';
    return String(durablePreviewUrl || '').trim() || live;
}
