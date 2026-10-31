/**
 * large-request-contract — bounded request transport for planner prompts.
 *
 * Proven defect: the planner's bounded recovery prompts embedded the original
 * request as `String(projectDescription).slice(0, 5000)`. Any brief longer
 * than 5000 characters silently lost its tail in exactly the branches that
 * must repair a large request (live-repair and both quality-contract repair
 * branches), so later requirements, failure context, cancellation directives,
 * and explicit routes vanished without any notice.
 *
 * Contract:
 * - The original request text is AUTHORITATIVE. It is embedded COMPLETE and
 *   VERBATIM when it fits within LARGE_REQUEST_MAX_CHARS, and it is
 *   REJECTED HONESTLY (never silently truncated) when it does not fit.
 * - LARGE_REQUEST_MAX_CHARS (60000 Unicode code points) is an application
 *   transport bound for prompt construction, NOT a provider context
 *   guarantee. Token density varies by language and script (Arabic/CJK and
 *   emoji can consume materially more tokens per code point), and smaller
 *   local contexts (for example a 4096-token window) may not hold a
 *   max-bound request plus evidence plus ledger. A request within the bound
 *   is transported faithfully; that alone does not promise any single model
 *   call can execute a huge complete build. Requests beyond the bound must
 *   be shortened by the caller and resubmitted; the planner reports them as
 *   blocked, never as delivered.
 * - Lengths are measured in Unicode code points (not UTF-16 code units), so
 *   Arabic, CJK, and emoji content is measured by what the reader wrote, not
 *   by surrogate-pair encoding accidents.
 * - Auxiliary context (failure evidence, serialized discovery evidence) is
 *   NOT authoritative: it keeps its existing per-prompt caps, but a
 *   truncation is now MARKED explicitly instead of vanishing silently.
 *   Inputs below the cap render byte-identical to the previous behaviour.
 *
 * Planner-only: this module builds prompt text and admission decisions. It
 * never calls the provider, never executes a plan, and never retries.
 */

export const LARGE_REQUEST_MAX_CHARS = 60000;

export const LARGE_REQUEST_OVER_BOUND_CODE = 'large_request_over_bound';
export const LARGE_REQUEST_INVALID_CODE = 'large_request_invalid';

export type LargeRequestTransport =
    | { ok: true; text: string; chars: number }
    | { ok: false; code: string; error: string; chars: number };

/** Unicode code-point length: one Arabic letter and one emoji each count 1. */
export function countRequestChars(value: string): number {
    let count = 0;
    for (const _codePoint of value) count += 1;
    return count;
}

/**
 * Admit an original request for prompt transport. Within the documented
 * maximum the COMPLETE text is returned verbatim. Anything else — a
 * non-string, an empty/blank value, or an over-bound request — is an
 * explicit rejection the caller must surface as blocked, never a truncated
 * prompt.
 */
export function transportRequestText(input: unknown): LargeRequestTransport {
    if (typeof input !== 'string' || !input.trim()) {
        return {
            ok: false,
            code: LARGE_REQUEST_INVALID_CODE,
            error: 'project_planner needs projectDescription — describe the project to plan.',
            chars: 0,
        };
    }
    const chars = countRequestChars(input);
    if (chars > LARGE_REQUEST_MAX_CHARS) {
        return {
            ok: false,
            code: LARGE_REQUEST_OVER_BOUND_CODE,
            error:
                `project_planner request is too large to transport faithfully: ` +
                `${chars} characters exceeds the documented maximum of ${LARGE_REQUEST_MAX_CHARS}. ` +
                `Shorten the brief (or split it into smaller requests) and resubmit; ` +
                `no plan was produced from a truncated request.`,
            chars,
        };
    }
    return { ok: true, text: input, chars };
}

export class LargeRequestRejectedError extends Error {
    readonly code: string;
    readonly chars: number;
    constructor(transport: Extract<LargeRequestTransport, { ok: false }>) {
        super(transport.error);
        this.name = 'LargeRequestRejectedError';
        this.code = transport.code;
        this.chars = transport.chars;
    }
}

/**
 * Embed the authoritative request inside a recovery prompt. Returns the
 * COMPLETE text verbatim when admissible; throws LargeRequestRejectedError
 * when the request cannot be transported faithfully. Recovery-prompt builders
 * must let this throw (or pre-check with transportRequestText) rather than
 * fall back to a sliced prefix: a sliced recovery prompt is the defect.
 */
export function requestTextForPrompt(input: unknown): string {
    const transported = transportRequestText(input);
    if (!transported.ok) throw new LargeRequestRejectedError(transported);
    return transported.text;
}

/**
 * Bound auxiliary (non-authoritative) context such as failure evidence or
 * serialized discovery evidence. Content below maxChars renders EXACTLY as
 * before (`String(input).slice(0, maxChars)`); content above the cap keeps
 * that same prefix but appends an explicit truncation marker so the model
 * and the logs can see that context was cut. Auxiliary context may be cut
 * with a marker; the authoritative request never may.
 */
export const DISCOVERY_EVIDENCE_MAX_CHARS = 9000;

/**
 * Bound serialized discovery evidence. Content at or below maxChars renders
 * verbatim; content above the cap keeps the same prefix but appends an
 * explicit truncation marker. A cut payload is NEVER complete: callers must
 * not label a marked payload as complete/authoritative without qualification.
 */
export function truncateEvidenceJsonText(serialized: string, maxChars: number = DISCOVERY_EVIDENCE_MAX_CHARS): string {
    if (serialized.length <= maxChars) return serialized;
    return `${serialized.slice(0, maxChars)}…[discovery evidence truncated: first ${maxChars} of ${serialized.length} characters — not complete]`;
}

export function truncateAuxiliaryText(input: unknown, maxChars: number): string {
    const text = String(input ?? '');
    if (text.length <= maxChars) return text.slice(0, maxChars);
    return `${text.slice(0, maxChars)}…[auxiliary context truncated: first ${maxChars} of ${text.length} characters]`;
}
