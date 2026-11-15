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

/**
 * service: a request that needs a server got a delivered part that serves one.
 * tests: the project's own tests, RUN — required when the request asks for
 * tests («tested» used to be a word found in a test file, even in a skipped
 * one, and nothing ever executed the suite). Both round 20.
 *
 * The general agent engine's verifier (core/engine/verify.ts) judges projects
 * no template wrote, and records three more — each under its own name, so no
 * other instrument's forget() can erase it (recordLiveAcceptance forgets
 * 'quality' when the live run fails):
 * source: the source parses, and its JSX components and names are declared.
 * build: the build the project owes ran and passed.
 * acceptance: every requirement the request named was judged on the source,
 * and the judgement does not block (core/quality/acceptance-gate).
 */
export type DeliveryInstrument = 'live' | 'quality' | 'scope' | 'coverage' | 'tests' | 'browser' | 'spec' | 'program' | 'service' | 'source' | 'build' | 'acceptance' | 'roles';

export interface DeliveryMeasurement {
    instrument: DeliveryInstrument;
    ok: boolean;
    /** Why it failed, in the instrument's own words. */
    error?: string;
    /** The delivered part (its root) this measured; '' for the delivery as a whole. */
    target?: string;
    /** coverage: requested items that could not be read — the delivery is then not verified, never delivered. */
    unread?: string[];
    /**
     * coverage: what he named that no instrument could measure — a record the
     * probe could not see, a rule only a multi-account probe could check
     * («each staff member only sees their own records»). Not verified, never
     * delivered — and never reported as «could not be read»: it was read.
     */
    unverified?: string[];
    /**
     * acceptance: his words of each requirement the judge found met, on a line
     * it copied out of the source. A requested item the records reader could
     * not read, held in these words, was measured — by the judge.
     */
    met?: string[];
    /** live: the URL project_run confirmed. */
    url?: string;
}

/**
 * His words compared as words: case, Arabic letter forms, marks and
 * punctuation aside, and the waw that joins an Arabic list item to the one
 * before it («علامات وشهادات» lists «شهادات»).
 */
function asWords(text: string): string {
    const words = String(text || '').toLowerCase()
        .replace(/[ً-ٰٟـ]/gu, '')
        .replace(/[أإآ]/gu, 'ا').replace(/ة/gu, 'ه').replace(/ى/gu, 'ي')
        .split(/[^\p{L}\p{N}]+/u).filter(Boolean)
        .map(word => /^و[؀-ۿ]{3,}$/u.test(word) ? word.slice(1) : word);
    return ` ${words.join(' ')} `;
}

/**
 * ⛔ AN ITEM NO RECORD READER CAN READ IS A REQUIREMENT, AND THE JUDGE MEASURES IT.
 *
 * The hard exam, 2026-11-04: «جدول حصص بلا تعارض», «حضور يومي», «شهادات قابلة
 * للطباعة» (H02) are a rule, a daily record and a printout — no table key the
 * records reader can give them — and «could not be read» refused the school
 * eight times over items the builder had no way to make readable. Each one is
 * in his words of a requirement the acceptance judge rules on, by a line it
 * must copy out of the source. The items held in a requirement judged met are
 * read; the rest are still «could not be read», and a requirement judged unmet
 * or unprovable refuses the delivery on its own.
 */
export function readAsRequirements(unread: string[], met: string[]): string[] {
    const held = (met || []).map(asWords);
    const heldWords = (met || []).map(contentWords).map(words => new Set(words));
    return (unread || []).filter(item => {
        const words = asWords(item);
        if (!words.trim().length) return false;
        if (held.some(quote => quote.includes(words))) return true;
        //  …or every word of it that names something, in any order, by ONE requirement.
        const own = contentWords(item);
        return own.length > 0 && heldWords.some(set => own.every(word => set.has(word) || Array.from(set).some(other => joinedTo(other, word))));
    });
}

/**
 * «بوحدات الدم» holds «وحدات الدم»: an Arabic word written joined to the
 * letters that cling to it (بـ، لـ، كـ، فـ، وـ — one or two of them). The
 * 500 exam, 2026-11-13 (P139): the judge's met requirement «نقاط وصول خاصة
 * بوحدات الدم» did not hold his record «وحدات الدم», so it read nothing.
 */
function joinedTo(written: string, word: string): boolean {
    if (word.length < 3 || written.length <= word.length || !written.endsWith(word)) return false;
    return /^[وفبلك]{1,2}$/u.test(written.slice(0, written.length - word.length));
}

/**
 * ⛔ A RECORD SERVED, TESTED AND JUDGED MET IS MEASURED — WHATEVER ITS ARABIC NAME.
 *
 * The 500 exam, 2026-11-12/13 (P129, P139, P149, P188): «العروض», «وحدات
 * الدم», «الدخول» have no dictionary English, so the records reader's only
 * Latin name for them is a transliteration («whdat_dms»), and no route can be
 * matched to it. P139 served and tested /api/blood-units (29 tests passing),
 * the judge found «نقاط وصول خاصة بوحدات الدم» met on the source — and the
 * delivery was refused as «not measured, so not verified: whdat_dms», words
 * that told the builder nothing it could do; P129 burnt 73 minutes on it.
 *
 * Such a record is measured by three instruments together, none of which
 * alone is enough: the delivered server registers a route no named record
 * claims and the project's own tests call it; those tests ran and passed; and
 * a requirement the judge found met on the source holds his words of the
 * record. A record no such route serves, a failing or unrun suite, or a judge
 * who found nothing met leaves it «not measured», told how to measure it.
 */
export interface UnverifiedRecord {
    /** «key — his words», as the delivery names it. */
    label: string;
    /** His words of the record: his Arabic label, or its key. */
    words: string;
    serving: boolean;
    presence: boolean;
    tests: boolean;
    /** Routes the delivered server registers, named for none of his records, that its own tests call. */
    routes: string[];
    /** How the builder makes it measurable. */
    how?: string;
}

const ROUTES_MARK = ' — its tests call routes named for none of his records: ';

/** One record the coverage could not measure, in the words the delivery and the builder read. */
export function unverifiedRecordText(record: UnverifiedRecord): string {
    const what = [record.serving ? 'serving not measured' : '', record.presence ? 'presence not measured' : '', record.tests ? 'tests not measured' : ''].filter(Boolean).join(', ');
    return `${record.label} (${what || 'not measured'})`
        + (record.routes.length ? `${ROUTES_MARK}${record.routes.join(', ')}` : '')
        + (record.how ? ` — ${record.how}` : '');
}

/** The record an unverified item names, read back; null for anything else (a rule, a capability). */
export function readUnverifiedRecord(item: string): UnverifiedRecord | null {
    const text = String(item || '');
    const head = text.match(/^(.+?) \(((?:serving|presence|tests) not measured(?:, (?:serving|presence|tests) not measured)*)\)/u);
    if (!head) return null;
    const label = head[1].trim();
    const at = text.indexOf(ROUTES_MARK);
    const routes = at < 0 ? [] : text.slice(at + ROUTES_MARK.length).split(' — ')[0].split(',').map(s => s.trim()).filter(Boolean);
    return {
        label,
        words: label.includes(' — ') ? label.slice(label.indexOf(' — ') + 3).trim() : label,
        serving: head[2].includes('serving'),
        presence: head[2].includes('presence'),
        tests: head[2].includes('tests'),
        routes,
    };
}

/** The unverified records a served route its passing tests call, with a requirement judged met, measured. */
export function verifiedAsRequirements(unverified: string[], met: string[], testsPassed: boolean): string[] {
    if (!testsPassed) return [];
    const records = (unverified || []).map(item => ({ item, record: readUnverifiedRecord(item) }));
    /*
     * A route vouches for one record, never for two (the r40 review, 2026-11-15: every
     * transliterated record was handed the same unclaimed routes, and «/api/settings» stood
     * for «العروض», never built). The coverage lists only the routes bound to a record
     * (request-coverage routeBoundTo); a route listed for two records here stands for neither.
     */
    const listedFor = new Map<string, number>();
    for (const { record } of records) for (const route of new Set(record?.routes || [])) listedFor.set(route, (listedFor.get(route) || 0) + 1);
    return records.filter(({ record }) => {
        if (!record || record.presence || !record.words) return false;
        if (!record.routes.some(route => listedFor.get(route) === 1)) return false;
        return readAsRequirements([record.words], met).length === 1;
    }).map(({ item }) => item);
}

/** What he named that no instrument measured, once the records served, tested and judged met are read. */
export function stillUnverified(measurements: DeliveryMeasurement[]): string[] {
    const unverified = Array.from(new Set(measurements.flatMap(m => m.instrument === 'coverage' ? (m.unverified || []) : [])));
    const tests = measurements.filter(m => m.instrument === 'tests');
    const testsPassed = tests.length > 0 && tests.every(m => m.ok === true);
    const read = new Set(verifiedAsRequirements(unverified, measurements.flatMap(m => m.instrument === 'acceptance' && m.ok === true ? (m.met || []) : []), testsPassed));
    return unverified.filter(item => !read.has(item));
}

/**
 * ⛔ HIS WORDS, IN THE ORDER THE READER OF HIS REQUEST PUT THEM.
 *
 * The hard sample, 2026-11-09 (L451, «a project management suite: … issues
 * with custom fields and workflows, a wiki with rich text …»): the request
 * reader split his list into «Custom fields on issues» and «Rich text in the
 * wiki», the judge found both met on the source, and the records reader's
 * items «issues with custom fields» and «wiki with rich text» were still «could
 * not be read» — the same words in another order. The delivery was refused ten
 * times in 35 minutes; the builder renamed tests and added requirements of its
 * own, none of which an item is read by. An item is held by one requirement
 * found met that holds every word of it that names something: the joining
 * words aside (with, of, on, في, مع, من …), the article «ال» aside, a plural
 * «s» aside. A negation is a word that names something («بلا تعارض», «without
 * conflicts»): it is never set aside.
 */
const JOINING_WORDS: ReadonlySet<string> = new Set([
    'with', 'and', 'of', 'in', 'on', 'for', 'the', 'a', 'an', 'per', 'by', 'to', 'its', 'their', 'from', 'at', 'into', 'each', 'every', 'or',
    'مع', 'في', 'من', 'علي', 'الي', 'عن', 'لكل', 'كل', 'ذات', 'او',
]);

function contentWords(text: string): string[] {
    return asWords(text).trim().split(' ').filter(Boolean)
        .map(word => /^(?:بال|وال|فال|كال|لل|ال)[؀-ۿ]{3,}$/u.test(word) ? word.replace(/^(?:بال|وال|فال|كال|لل|ال)/u, '') : word)
        .filter(word => !JOINING_WORDS.has(word))
        .map(word => /^[a-z]{3,}ies$/u.test(word) ? `${word.slice(0, -3)}y`
            : /^[a-z]{3,}[^s]s$/u.test(word) ? word.slice(0, -1) : word);
}

/** The coverage items that could not be read and no requirement judged met holds. */
export function stillUnread(measurements: DeliveryMeasurement[]): string[] {
    const unread = Array.from(new Set(measurements.flatMap(m => m.instrument === 'coverage' ? (m.unread || []) : [])));
    const read = new Set(readAsRequirements(unread, measurements.flatMap(m => m.instrument === 'acceptance' ? (m.met || []) : [])));
    return unread.filter(item => !read.has(item));
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
    /** What he named that no instrument could measure — not verified, never delivered. */
    unverified: string[];
    /** The first failure's error, by instrument priority. */
    firstError: string;
}

const PRIORITY: DeliveryInstrument[] = ['live', 'program', 'source', 'build', 'service', 'quality', 'coverage', 'tests', 'acceptance', 'roles', 'scope', 'browser', 'spec'];

/** The order failures are named in: the first failure in this order is the verdict's firstError. */
export const DELIVERY_PRIORITY: readonly DeliveryInstrument[] = PRIORITY;

export function deliveryVerdict(input: DeliveryVerdictInput): DeliveryVerdict {
    const measurements = Array.isArray(input.measurements) ? input.measurements : [];
    const failures = measurements.filter(m => m.ok !== true);
    const has = (instrument: DeliveryInstrument) => measurements.some(m => m.instrument === instrument);
    const passed = (instrument: DeliveryInstrument) => has(instrument) && measurements.filter(m => m.instrument === instrument).every(m => m.ok === true);
    const required = Array.from(new Set<DeliveryInstrument>([input.primary === 'program' ? 'program' : 'live', ...(input.required || [])]));
    const unmeasured = required.filter(instrument => !has(instrument));
    const unread = stillUnread(measurements);
    const unverified = stillUnverified(measurements);
    const coverageFailed = failures.some(m => m.instrument === 'coverage');
    const base = input.phaseVerified === true && input.requestFidelityBlocked !== true;
    const verified = base && failures.length === 0 && unmeasured.length === 0 && unread.length === 0 && unverified.length === 0;
    // Partial rides only on the TaskFlow shape: everything measured passed except
    // named capability scope, and every required instrument — Browser QA among
    // them — measured clean. Missing records, unread or unmeasured items never ride it.
    const partial = !verified && base
        && failures.length > 0 && failures.every(m => m.instrument === 'scope')
        && unmeasured.length === 0 && unread.length === 0 && unverified.length === 0
        && required.every(instrument => instrument === 'scope' || passed(instrument));
    const firstFailure = PRIORITY.map(instrument => failures.find(m => m.instrument === instrument)).find(Boolean);
    return {
        verified,
        partial,
        failures,
        unmeasured,
        coverageFailed,
        unread,
        unverified,
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
