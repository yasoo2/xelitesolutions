/**
 * THE ACCEPTANCE GATE EVERY BUILDER SHARES: WHAT HE ASKED FOR, READ ONCE, AND
 * WHEN A JUDGEMENT OF IT MAY BLOCK A DELIVERY.
 *
 * These four lived inside ReactProjectTool.ts, so any other engine that wanted
 * the same reading and the same blocking rule had to import a 9 000-line
 * template generator to get them (map R5, C11). They moved here unchanged; the
 * React builder imports them from this file, and so does the general agent
 * engine's verifier (core/engine/verify.ts), so both judge a request by one
 * reader and one rule.
 */
import { namedRequirements, requirementsFromRequestClauses, type NamedRequirement } from './named-requirements';

/**
 *  «acceptance_criteria_unmet» — AND WHICH ONES?
 *
 *  Measured on his screen one round after the visual-audit blocker was made
 *  to speak. The build got further, and stopped at:
 *
 *      Error: acceptance_criteria_unmet
 *
 *  The ledger knows exactly which criteria are unmet — it holds each one with
 *  its id and the evidence it could not find — and the error carried none of
 *  them. So he is told a judgement was made against him and not what it was,
 *  and the only way to learn it is to read a message that may be off-screen.
 *
 *  This is the same defect as the visual audit's, in the next layer down: a
 *  report that names the MECHANISM instead of the FINDING. Fixing one and
 *  leaving the other would be fixing the instance and not the class, which
 *  the third law forbids.
 *
 *  The ids come first because layers match on them, and a cap keeps a long
 *  ledger from turning one line into a page — with the remainder counted, so
 *  the number never lies about how much was left out.
 */
export function deliveryErrorForAcceptance(
    criteria: Array<{ id: string; verdict: string }>,
    max = 6,
): string {
    const id = 'acceptance_criteria_unmet';
    const unmet = (criteria || []).filter(c => c && c.verdict === 'unmet').map(c => String(c.id));
    if (!unmet.length) return id;
    const shown = unmet.slice(0, max).join(', ');
    const rest = unmet.length - Math.min(unmet.length, max);
    return `${id}: ${shown}${rest > 0 ? ` (+${rest} more)` : ''}`;
}

/**
 *  ⛔ NOTHING READ IS NOT NOTHING ASKED.
 *
 *  Eval round 15 (2026-10-24, P101): the request reader timed out, no clause
 *  survived, the catalogue knew no feature of «a REST API for a dental clinic
 *  with patients, appointments and treatments», and the ledger came back with
 *  ZERO criteria — which this gate read as nothing to block. A stock bookings
 *  API was delivered green for a request no one had read.
 *
 *  The two empty ledgers are told apart by the READER's own outcome, never by
 *  the text: the model answered and his sentence named nothing judgeable
 *  (today's behaviour), or no reading happened at all (`requestUnread`). The
 *  second is unverified, whatever the catalogue says — a known-features count
 *  over an unread request is diagnostic, not his contract.
 */
export function acceptanceBlocksDelivery(a: {
    criteria: number;
    accepted: boolean;
    unprovable: number;
    named: number;
    judgeWasBlind: boolean;
    requestUnread: boolean;
}): boolean {
    if (a.requestUnread) return true;
    return a.criteria > 0
        && (!a.accepted || (a.named > 0 && (a.judgeWasBlind || a.unprovable > 0)));
}

/** The delivery error when the request itself could not be read. */
export function deliveryErrorForUnreadRequest(why: string): string {
    const reason = String(why || '').trim();
    return `acceptance_unverified: request_not_read${reason ? ` — ${reason.slice(0, 160)}` : ''}`;
}

/**
 *  READING HIS REQUEST — AND WHAT IS STILL READ WHEN THE READER FAILS.
 *
 *  The model reads the requirements. When it gets no answer, or the reader
 *  itself throws, the explicit clauses of his own sentence are still read
 *  deterministically before anything is called unread: a thrown reader used to
 *  skip that floor and go straight to «unread» (eval round 15).
 *  `requestUnread` is true only when no reading happened AND nothing was
 *  retained from his words — see acceptanceBlocksDelivery.
 */
export async function readRequestRequirements(
    request: string,
    isArabic: boolean,
    ask: (prompt: string) => Promise<string>,
    term: (line: string) => void,
    reader: typeof namedRequirements = namedRequirements,
): Promise<{ named: NamedRequirement[]; whyNotRead: string; requestUnread: boolean; modelUnavailable: boolean }> {
    let named: NamedRequirement[] = [];
    let whyNotRead = '';
    let modelUnavailable = false;
    // The reader counts the passes the model actually answered.
    let readerAnswered = false;
    try {
        const read = await reader(request, isArabic, ask);
        readerAnswered = Number(read.passes) > 0;
        named = read.requirements;
        for (const r of read.rejected) {
            term(`  refused «${r.text}»: ${r.reason}`);
        }
        if (read.rejected.some((r) => /model could not be reached|model did not answer|timed out/i.test(String(r.reason)))) {
            modelUnavailable = true;
        }
        if (!named.length) {
            whyNotRead = !readerAnswered
                ? String(read.rejected[0]?.reason || 'the model did not answer')
                : read.rejected.length
                    ? `the model named ${read.rejected.length}, and none survived the filters`
                    : 'the model named nothing in this request';
        }
    } catch (e: any) {
        modelUnavailable = true;
        named = [];
        whyNotRead = `the reader failed: ${String(e && e.message || e).slice(0, 90)}`;
        term(`reading your request failed: ${String(e && e.message || e).slice(0, 120)}`);
    }
    if (!named.length) {
        const deterministic = requirementsFromRequestClauses(request);
        if (deterministic.length) {
            named = deterministic;
            whyNotRead = '';
            term(`provider reading unavailable; retained ${deterministic.length} explicit clause(s) from your request for build and QA`);
        }
    }
    term(named.length
        ? `read from your request: ${named.length} named — ${named.map(r => r.text).join(' · ')}`
        : `read from your request: nothing nameable survived (${whyNotRead}) — falling back to the known-features list`);
    return { named, whyNotRead, requestUnread: !readerAnswered && !named.length, modelUnavailable };
}
