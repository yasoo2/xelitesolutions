/**
 * ACTION VERIFICATION — effect evidence + failure diagnosis for click/type/fill.
 *
 * M5 proved navigation by observation instead of fixed sleeps. The action path
 * had the same disease one layer down:
 *
 *   - A `type`/`fill` that threw nothing was reported ok:true even when the
 *     field never received the text (framework-controlled inputs that revert,
 *     keystrokes landing while focus was elsewhere). No one read the field back.
 *   - A `fill` action with a selector silently filled the EMPTY string: the
 *     selector path only read `a.text` for `type`, so `fill` cleared the field
 *     and reported success. Its password masking and secret-token handling had
 *     the same `type`-only gap.
 *   - Two bare `fill(text)` calls used Playwright's default timeout instead of
 *     the step's action budget, so one stuck fill could burn the whole run.
 *   - Every action failure collapsed to timeout/overlay/unknown. Detached
 *     nodes, strict-mode (ambiguous) selectors and disabled controls all
 *     arrived as 'unknown', which no self-repair cure can act on.
 *
 * This module holds the policy; the executor only wires it in:
 *
 *   - typeActionText: the text an action intends to put into a field.
 *     `fill` carries text exactly like `type` — the fix for the silent clear.
 *   - classifyActionError: Playwright error text -> FailureReason, so the
 *     failure names its own cure (re-query, disambiguate, wait-for-enabled).
 *   - ensureTypedValue: read the field back after a type/fill; on mismatch
 *     make exactly ONE clear+set repair and read again, then report what was
 *     actually observed. Only booleans and lengths are ever recorded — never
 *     the values themselves, so password fills stay credential-safe.
 *
 * Failure is claimed only with positive evidence: a twice-observed mismatch
 * fails the step as 'value_not_applied'. When the value cannot be read back
 * at all (non-field target, closed page), the step keeps the action's own
 * verdict and is marked unverified instead of failed — verification is
 * evidence, not a new failure mode.
 */

import type { FailureReason } from './types';

/** The text an action intends to put into a field. `fill` carries `text` exactly like `type`. */
export function typeActionText(name: string, a: any): string {
    if (name !== 'type' && name !== 'fill') return '';
    return String(a?.text || '');
}

/**
 * Map a Playwright action failure to the FailureReason that names its cure.
 * Specific causes come before the generic timeout: Playwright's retry loop
 * appends "Timeout Nms exceeded" to almost every action failure, so a
 * timeout-first check would collapse detached/ambiguous/disabled/hidden/
 * intercept failures into 'timeout' — the information loss this classifier
 * exists to fix. A bare timeout (transport stall) still lands on 'timeout';
 * everything unrecognised stays 'unknown'.
 */
export function classifyActionError(error: unknown): FailureReason {
    const msg = String((error as any)?.message ?? error ?? '');
    if (/strict mode violation|resolv\w* to \d+ elements/i.test(msg)) return 'selector_ambiguous';
    if (/detached|not attached/i.test(msg)) return 'element_detached';
    if (/intercepts pointer events|intercepted|overlay|not clickable|receives pointer events/i.test(msg)) return 'overlay_blocking_click';
    if (/not enabled|\bdisabled\b|not editable|read-?only/i.test(msg)) return 'element_disabled';
    if (/not visible|\bhidden\b|not found|could not find|no element|waiting for (locator|selector)|element_not_found|not_found|no_locator/i.test(msg)) {
        return 'element_not_found';
    }
    if (/timeout|timed out|exceeded/i.test(msg)) return 'timeout';
    return 'unknown';
}

/** Credential-safe comparison: lengths and booleans only, never the values. */
export interface FieldValueCheck {
    match: boolean;
    expectedLength: number;
    observedLength: number;
    /** False when the field could not be read back at all. */
    readOk: boolean;
}

export function compareFieldValue(observed: string | null | undefined, expected: string): FieldValueCheck {
    const expectedLength = String(expected).length;
    if (observed === null || observed === undefined) {
        return { match: false, expectedLength, observedLength: -1, readOk: false };
    }
    return { match: observed === expected, expectedLength, observedLength: observed.length, readOk: true };
}

/** Minimal field surface: real Playwright locators and test fakes both satisfy it. */
export interface FieldOps {
    /** Current field value. A rejection (or null) means the field could not be read. */
    read(): Promise<string | null>;
    /** Replace the field content with the text. May throw; the caller classifies it. */
    clearAndSet(text: string): Promise<void>;
}

export interface EnsureTypedValueResult extends FieldValueCheck {
    /** True when exactly one clear+set repair was attempted. Never more. */
    repaired: boolean;
}

async function readSafely(ops: FieldOps): Promise<string | null> {
    try {
        return await ops.read();
    } catch {
        return null;
    }
}

/**
 * Verify a typed/filled value by reading it back. On mismatch, one bounded
 * clear+set repair and a second read. Total extra cost: at most two reads and
 * one set. A throwing repair propagates so the caller classifies the real error.
 */
export async function ensureTypedValue(ops: FieldOps, expected: string): Promise<EnsureTypedValueResult> {
    const first = compareFieldValue(await readSafely(ops), expected);
    if (!first.readOk) return { ...first, repaired: false };
    if (first.match) return { ...first, repaired: false };
    await ops.clearAndSet(expected);
    const second = compareFieldValue(await readSafely(ops), expected);
    return { ...second, repaired: true };
}
