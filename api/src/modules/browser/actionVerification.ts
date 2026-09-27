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
 *
 * Clicks had the same disease from the other side: a click that threw nothing
 * was reported ok:true with no record of what it caused, so a dead control
 * and a working one were indistinguishable in the receipt. The click half of
 * this module fixes that with the same evidence-only philosophy:
 *
 *   - CLICK_FINGERPRINT_SCRIPT: one in-page evaluate returning a lightweight
 *     DOM fingerprint (url, title, element count, text length, djb2 hash of
 *     the markup). Cheap to capture, sensitive to real change.
 *   - compareClickEffect: two snapshots (before/after) -> navigated,
 *     domChanged, effectObserved, plus the count of NEW runtime error
 *     signals (pageerror/console-error/requestfailed) observed during the
 *     step. A no-effect click is reported, never failed: plenty of
 *     legitimate clicks change nothing observable, and verification is
 *     evidence, not a new failure mode.
 *
 * Selects and coordinate clicks were the last state-changing actions without
 * observed-effect evidence:
 *
 *   - A `select` set the value and reported the resolved option text with no
 *     readback, so a framework-controlled select that reverted on change
 *     still arrived as ok:true. Selects now verify through the same
 *     read-compare-repair-once lens as type/fill: matchSelectOption resolves
 *     the wanted option (exact value-or-text, then substring), the built
 *     in-page scripts apply it and read the live value back, and
 *     ensureTypedValue drives the one bounded re-apply. Only booleans and
 *     lengths are recorded — never the option values.
 *   - A `click_coordinates` reported a bare ok:true with no record of what
 *     it caused, so a dead-region poke and a working control were
 *     indistinguishable. Coordinate clicks now reuse the click snapshot
 *     machinery (same fingerprint, same comparator, same telemetry delta),
 *     evidence-only like clicks: a no-effect poke is reported, never failed.
 *
 * Scrolls were the last movement actions without observed-effect evidence:
 *
 *   - A `scroll` fired the wheel and reported ok:true even when the page
 *     never moved (unscrollable page, already at the edge, wheel swallowed
 *     by a nested scrollable region), so Joe mis-grounded every coordinate
 *     after it. Scrolls now snapshot the scroll geometry before and after
 *     and report moved/delta/at-edge, with one bounded re-pulse when
 *     movement was possible but nothing moved. Evidence-only: sitting at
 *     an edge is routine, and the planner decides from moved/atEdge.
 *   - A `scroll_to_element` scrolled blind and reported ok:true even when
 *     the selector matched nothing, and an invalid selector aborted the
 *     whole run. Targets are now read before and after (found/inViewport,
 *     booleans only) with one bounded instant re-scroll: a missing target
 *     fails as scroll_target_not_found, a twice-observed outside-viewport
 *     target fails as scroll_target_not_visible, and an invalid selector
 *     fails its step instead of the run.
 *
 * Keys and hovers were the remaining state-changing interactions without
 * observed-effect evidence:
 *
 *   - A `key` pressed blind and reported ok:true even when nothing
 *     happened (focus never moved, Enter submitted nothing, the keystroke
 *     landed on a dead page), so keyboard-driven flows — search+Enter,
 *     Tab order, Escape-dismissed dialogs — were indistinguishable from
 *     success. Keys now snapshot the page fingerprint plus the focused
 *     element before and after: navigation, DOM change, focus change and
 *     new runtime errors are reported, evidence-only like clicks.
 *   - A `hover` moved the mouse and reported ok:true with no record of
 *     what it revealed, so a menu that opened and a hover over static
 *     text shared one receipt. Hovers now reuse the click snapshot
 *     machinery (same fingerprint, same comparator, same telemetry
 *     delta): a revealed menu arrives as domChanged, a static hover as
 *     honestly no-effect.
 *
 * History traversal was the last navigation family without observed-effect
 * evidence:
 *
 *   - A `back`/`forward`/`reload` swallowed its own outcome (the Playwright
 *     response AND any thrown error went to `.catch(() => null)`) and
 *     reported a bare ok:true, so a traversal that moved and a back
 *     against an empty history shared one receipt. Worse, the response is
 *     not even a reliable signal: real traversals on non-network pages
 *     resolve null just like empty-history no-ops do (observed in a real
 *     Chromium probe), so the outcome cannot be read from the response.
 *   - Traversals now snapshot the document identity (performance.timeOrigin
 *     plus the navigation entry type) alongside the click fingerprint: a
 *     new document load arrives as documentChanged, a same-document move
 *     as navigated, an empty-history no-op as honestly no-effect. The
 *     thrown/not-thrown outcome is recorded as a boolean, and the fixed
 *     250ms sleep is replaced by the same bounded readiness probe goto
 *     uses. Evidence-only like clicks: a no-op traversal is reported,
 *     never failed.
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
    if (isSelectorSyntaxError(msg)) return 'invalid_selector';
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

/** One select option as seen by the resolver: value and visible text. */
export interface SelectOption {
    value: string;
    text: string;
}

/**
 * Resolve which option a select request means. Exact value-or-text first
 * (case-insensitive, trimmed), then substring value-or-text. Returns the
 * option index, or -1 when nothing matches or the request is empty.
 *
 * This is the single source of truth for option resolution: the in-page set
 * script below embeds this exact function source, so unit tests on this
 * function and real-browser runs of the built script can never drift apart.
 * Keep it dependency-free (no imports, no outer references) so the embedded
 * copy runs standalone inside the page.
 */
export function matchSelectOption(options: SelectOption[], wanted: string): number {
    const norm = (s: string): string => String(s === null || s === undefined ? '' : s).trim().toLowerCase();
    const w = norm(wanted);
    if (!w) return -1;
    const opts = Array.isArray(options) ? options : [];
    const exact = opts.findIndex((o) => norm(o.value) === w || norm(o.text) === w);
    if (exact >= 0) return exact;
    return opts.findIndex((o) => norm(o.text).includes(w) || norm(o.value).includes(w));
}

/** What the in-page set script reports: the human label plus the exact value to verify. */
export interface SelectSetResult {
    chosen: string;
    resolvedValue: string;
    optionCount: number;
}

/** What the in-page read script reports: the live control state. */
export interface SelectReadResult {
    value: string;
    selectedIndex: number;
    optionCount: number;
}

/**
 * Build a self-contained in-page evaluate that applies a select choice.
 * The returned string is a complete expression — pass it straight to
 * page.evaluate with NO second argument (Playwright's string form does not
 * take args; the inputs are baked in as a JSON literal instead, which also
 * keeps hostile option text inert). Resolves to SelectSetResult, or null
 * when no select sits under the point or no option matches.
 */
export function buildSelectSetEval(x: number, y: number, wanted: string): string {
    const fn = `(arg) => {
  const matchSelectOption = ${matchSelectOption.toString()};
  const at = document.elementFromPoint(arg.x, arg.y);
  const sel = (at && (at.tagName === 'SELECT' ? at : (at.closest ? at.closest('select') : null)));
  if (!sel) return null;
  const opts = Array.from(sel.options).map((o) => ({ value: String(o.value), text: String(o.textContent || '') }));
  const idx = matchSelectOption(opts, arg.value);
  if (idx < 0 || idx >= sel.options.length) return null;
  const opt = sel.options[idx];
  sel.value = opt.value;
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return { chosen: String(opt.textContent || opt.value || ''), resolvedValue: String(opt.value), optionCount: opts.length };
}`;
    return `(${fn})(${JSON.stringify({ x: Number(x), y: Number(y), value: String(wanted === null || wanted === undefined ? '' : wanted) })})`;
}

/**
 * Build a self-contained in-page evaluate that reads the live select state
 * under a point. Self-contained like the set script. Resolves to
 * SelectReadResult, or null when no select sits under the point.
 */
export function buildSelectReadEval(x: number, y: number): string {
    const fn = `(arg) => {
  const at = document.elementFromPoint(arg.x, arg.y);
  const sel = (at && (at.tagName === 'SELECT' ? at : (at.closest ? at.closest('select') : null)));
  if (!sel) return null;
  return { value: String(sel.value), selectedIndex: Number(sel.selectedIndex), optionCount: Number(sel.options ? sel.options.length : 0) };
}`;
    return `(${fn})(${JSON.stringify({ x: Number(x), y: Number(y) })})`;
}

/**
 * One in-page evaluate returning a lightweight DOM fingerprint. It is an
 * IIFE: pass it straight to page.evaluate. The markup hash is computed
 * INSIDE the page (djb2 over outerHTML) so the round-trip carries a few
 * dozen bytes no matter how large the document is. Counts and lengths
 * only — no markup, text or values ever leave the page.
 */
export const CLICK_FINGERPRINT_SCRIPT = `(() => {
  const doc = document;
  const html = (doc && doc.documentElement && doc.documentElement.outerHTML) || '';
  let h = 5381;
  for (let i = 0; i < html.length; i += 1) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
  return {
    url: String((doc && doc.location && doc.location.href) || ''),
    title: String((doc && doc.title) || ''),
    elements: doc ? doc.getElementsByTagName('*').length : 0,
    textLength: (doc && doc.body && doc.body.innerText ? String(doc.body.innerText) : '').length,
    htmlHash: (h >>> 0).toString(36),
  };
})()`;

/** What the page looked like at one instant. Null means it could not be read. */
export interface ClickFingerprint {
    url: string;
    title: string;
    elements: number;
    textLength: number;
    htmlHash: string;
}

/** Cumulative session runtime-error counters. Null means no telemetry feeds them. */
export interface RuntimeErrorCounts {
    js: number;
    console: number;
    network: number;
}

export interface ClickContext {
    fingerprint: ClickFingerprint | null;
    errors: RuntimeErrorCounts | null;
}

export interface ClickEffect {
    /** False when the page could not be read before or after the click. */
    readOk: boolean;
    /** The URL changed across the click (a same-page anchor jump counts). */
    navigated: boolean;
    /** Title, element count, text length or markup hash changed. */
    domChanged: boolean;
    /** navigated || domChanged. Evidence only — never a failure by itself. */
    effectObserved: boolean;
    /**
     * New runtime error signals (pageerror + console-error + requestfailed)
     * observed during the step. Absent when unmeasurable: no telemetry, or
     * the counters reset mid-step (telemetry re-created), which makes any
     * delta meaningless. Reported even when the DOM itself is unreadable —
     * a click that kills the page can still leave its error behind.
     */
    runtimeErrors?: number;
}

/**
 * Compare two click snapshots. Null-tolerant: a missing snapshot (page
 * closed, evaluate threw, no telemetry) degrades to readOk:false and/or an
 * absent runtimeErrors count instead of inventing an effect.
 */
export function compareClickEffect(before: ClickContext | null, after: ClickContext | null): ClickEffect {
    const noEffect: ClickEffect = { readOk: false, navigated: false, domChanged: false, effectObserved: false };
    const b = before?.fingerprint ?? null;
    const a = after?.fingerprint ?? null;
    if (b && a) {
        noEffect.readOk = true;
        noEffect.navigated = b.url !== a.url;
        noEffect.domChanged =
            b.title !== a.title ||
            b.elements !== a.elements ||
            b.textLength !== a.textLength ||
            b.htmlHash !== a.htmlHash;
        noEffect.effectObserved = noEffect.navigated || noEffect.domChanged;
    }
    const be = before?.errors ?? null;
    const ae = after?.errors ?? null;
    if (be && ae) {
        const beforeTotal = be.js + be.console + be.network;
        const afterTotal = ae.js + ae.console + ae.network;
        // A reset counter reads lower than before; the delta is meaningless.
        if (afterTotal >= beforeTotal) noEffect.runtimeErrors = afterTotal - beforeTotal;
    }
    return noEffect;
}

/** Minimal snapshot surface: real Playwright pages and test fakes both satisfy it. */
export interface ClickEffectOps {
    snapshot(): Promise<ClickContext>;
}

/** One scroll-position snapshot: viewport/scroll geometry numbers only, never content. */
export interface ScrollSnapshot {
    x: number;
    y: number;
    innerW: number;
    innerH: number;
    scrollW: number;
    scrollH: number;
}

/**
 * One in-page evaluate returning the current scroll geometry. It is an
 * IIFE: pass it straight to page.evaluate. Numbers only — no markup, text
 * or values ever leave the page.
 */
export const SCROLL_SNAPSHOT_SCRIPT = `(() => {
  const de = (document && document.documentElement) || null;
  const w = (typeof window !== 'undefined') ? window : null;
  return {
    x: Math.round((w && (w.scrollX || w.pageXOffset)) || 0),
    y: Math.round((w && (w.scrollY || w.pageYOffset)) || 0),
    innerW: Math.round((w && w.innerWidth) || 0),
    innerH: Math.round((w && w.innerHeight) || 0),
    scrollW: de ? Math.round(de.scrollWidth || 0) : 0,
    scrollH: de ? Math.round(de.scrollHeight || 0) : 0,
  };
})()`;

export interface ScrollEffect {
    /** False when the page could not be read before or after the scroll. */
    readOk: boolean;
    /** The viewport moved on either axis. */
    moved: boolean;
    deltaX: number;
    deltaY: number;
    /** After-state edge pins. A 1px tolerance absorbs subpixel rounding. */
    atTop: boolean;
    atBottom: boolean;
}

/**
 * Compare two scroll snapshots. Null-tolerant: a missing snapshot (page
 * closed, evaluate threw) degrades to readOk:false instead of inventing
 * movement.
 */
export function compareScrollEffect(before: ScrollSnapshot | null, after: ScrollSnapshot | null): ScrollEffect {
    const none: ScrollEffect = { readOk: false, moved: false, deltaX: 0, deltaY: 0, atTop: false, atBottom: false };
    if (!before || !after) return none;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    return {
        readOk: true,
        moved: dx !== 0 || dy !== 0,
        deltaX: dx,
        deltaY: dy,
        atTop: after.y <= 0,
        atBottom: after.y + after.innerH >= after.scrollH - 1,
    };
}

/** Minimal rect surface: DOMRect and test fakes both satisfy it. */
export interface ViewportRect {
    top: number;
    left: number;
    bottom: number;
    right: number;
    width: number;
    height: number;
}

/**
 * Whether a box intersects the viewport. Zero-area boxes (display:none,
 * detached) never count.
 *
 * Dependency-free so the in-page read script below can embed this exact
 * source — unit tests and real-browser runs share one truth. Keep it that
 * way: no imports, no outer references.
 */
export function isRectInViewport(rect: ViewportRect | null | undefined, vw: number, vh: number): boolean {
    if (!rect) return false;
    const w = Number((rect as any).width);
    const h = Number((rect as any).height);
    const top = Number((rect as any).top);
    const left = Number((rect as any).left);
    const bottom = Number((rect as any).bottom);
    const right = Number((rect as any).right);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
    if (!Number.isFinite(top) || !Number.isFinite(left) || !Number.isFinite(bottom) || !Number.isFinite(right)) return false;
    if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw <= 0 || vh <= 0) return false;
    return bottom > 0 && top < vh && right > 0 && left < vw;
}

/** What the in-page scroll-target read script reports: booleans only. */
export interface ScrollTargetState {
    found: boolean;
    inViewport: boolean;
    /** True when the selector itself is syntactically invalid — a planner bug, not a missing element. */
    invalid: boolean;
}

/**
 * Build a self-contained in-page evaluate that reports whether a selector
 * matches an element and whether that element intersects the viewport.
 * Complete expression — pass it straight to page.evaluate with NO second
 * argument; the selector is baked in as a JSON literal so hostile text
 * stays inert. Resolves to ScrollTargetState, never null, never throws.
 */
export function buildScrollTargetReadEval(selector: string): string {
    const fn = `(arg) => {
  const isRectInViewport = ${isRectInViewport.toString()};
  let el = null;
  try { el = document.querySelector(arg.selector); } catch (err) { return { found: false, inViewport: false, invalid: true }; }
  if (!el) return { found: false, inViewport: false, invalid: false };
  const r = el.getBoundingClientRect();
  return { found: true, inViewport: isRectInViewport(r, window.innerWidth, window.innerHeight), invalid: false };
}`;
    return `(${fn})(${JSON.stringify({ selector: String(selector === null || selector === undefined ? '' : selector) })})`;
}

/**
 * Build a self-contained in-page evaluate that scrolls a selector's element
 * into centered view (smooth unless instant). Self-contained like the read
 * script. Resolves true when an element was found and scrolled, false
 * otherwise. Never throws.
 */
export function buildScrollIntoViewEval(selector: string, instant: boolean): string {
    const fn = `(arg) => {
  let el = null;
  try { el = document.querySelector(arg.selector); } catch (err) { return false; }
  if (!el) return false;
  try {
    if (arg.instant) el.scrollIntoView({ block: 'center' });
    else el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    try { el.scrollIntoView(); } catch (e2) { return false; }
  }
  return true;
}`;
    return `(${fn})(${JSON.stringify({ selector: String(selector === null || selector === undefined ? '' : selector), instant: instant ? true : false })})`;
}

/**
 * One in-page evaluate returning the focused-element descriptor. It is an
 * IIFE: pass it straight to page.evaluate. Tag (uppercased, capped) plus
 * booleans and lengths only — no ids, classes, names or values ever leave
 * the page, so a canary sitting in a field cannot leak into a receipt.
 */
export const KEY_FOCUS_SCRIPT = `(() => {
  const ae = (document && document.activeElement) || null;
  if (!ae) return { hasFocus: false, tag: '', idLen: 0, classLen: 0, nameLen: 0, valueLen: 0, isBody: false };
  const tag = String(ae.tagName || '').toUpperCase().slice(0, 16);
  const idLen = String((ae.id === null || ae.id === undefined) ? '' : ae.id).length;
  const cn = ae.className;
  const classStr = (typeof cn === 'string') ? cn : ((cn && typeof cn.baseVal === 'string') ? cn.baseVal : '');
  const classLen = String(classStr || '').length;
  let nameLen = 0;
  try { const nm = ae.getAttribute ? ae.getAttribute('name') : null; nameLen = nm ? String(nm).length : 0; } catch (e) { nameLen = 0; }
  let valueLen = 0;
  try { const v = ae.value; valueLen = (typeof v === 'string') ? v.length : 0; } catch (e) { valueLen = 0; }
  return { hasFocus: true, tag: tag, idLen: idLen, classLen: classLen, nameLen: nameLen, valueLen: valueLen, isBody: tag === 'BODY' };
})()`;

/** Focused-element descriptor: tag plus booleans and lengths, never content. */
export interface KeyFocus {
    hasFocus: boolean;
    tag: string;
    idLen: number;
    classLen: number;
    nameLen: number;
    valueLen: number;
    isBody: boolean;
}

/** Everything a keypress can observably move: the page plus the focus. */
export interface KeyContext {
    page: ClickContext | null;
    focus: KeyFocus | null;
}

export interface KeyEffect {
    /** False when the page could not be read before or after the key. */
    readOk: boolean;
    /** The URL changed across the keypress. */
    navigated: boolean;
    /** Title, element count, text length or markup hash changed. */
    domChanged: boolean;
    /** The focused-element descriptor changed (Tab order, dialog trap, typed text). */
    focusChanged: boolean;
    /** False when the focus could not be read before or after the key. */
    focusReadOk: boolean;
    /** navigated || domChanged || focusChanged. Evidence only — never a failure by itself. */
    effectObserved: boolean;
    /** New runtime error signals observed during the step; absent when unmeasurable. */
    runtimeErrors?: number;
}

function sameKeyFocus(a: KeyFocus, b: KeyFocus): boolean {
    return a.hasFocus === b.hasFocus
        && a.tag === b.tag
        && a.idLen === b.idLen
        && a.classLen === b.classLen
        && a.nameLen === b.nameLen
        && a.valueLen === b.valueLen
        && a.isBody === b.isBody;
}

/**
 * Compare two key snapshots. The page half delegates to compareClickEffect
 * (one truth for fingerprint deltas); the focus half compares descriptors.
 * Null-tolerant: missing halves degrade to readOk/focusReadOk:false and an
 * absent runtimeErrors count instead of inventing an effect.
 */
export function compareKeyEffect(before: KeyContext | null, after: KeyContext | null): KeyEffect {
    const page = compareClickEffect(before?.page ?? null, after?.page ?? null);
    const effect: KeyEffect = {
        readOk: page.readOk,
        navigated: page.navigated,
        domChanged: page.domChanged,
        focusChanged: false,
        focusReadOk: false,
        effectObserved: page.effectObserved,
        ...(page.runtimeErrors === undefined ? {} : { runtimeErrors: page.runtimeErrors }),
    };
    const bf = before?.focus ?? null;
    const af = after?.focus ?? null;
    if (bf && af) {
        effect.focusReadOk = true;
        effect.focusChanged = !sameKeyFocus(bf, af);
        effect.effectObserved = effect.effectObserved || effect.focusChanged;
    }
    return effect;
}

/** How the typed text is expected to land in the focused field. */
export type TypeExpectMode =
    /** The field was cleared first (coordinate type): after-length must equal the text length. */
    | 'set'
    /** The text was typed at the cursor (global type): after-length must grow by the text length. */
    | 'append'
    /** Control keys (Enter/Tab/Backspace): length movement is unpredictable, only focus/page deltas count. */
    | 'keys';

/**
 * Everything a locatorless type/fill can observably move: the key half
 * (page + focus) plus what the typed text implies for the focused field.
 * Booleans and the runtime delta only — no lengths — so the same receipt
 * shape is safe for secret and non-secret text alike.
 */
export interface TypeEffect extends KeyEffect {
    /** The focused field value length moved exactly as the typed text implies. Undefined when unmeasurable. */
    valueApplied?: boolean;
    /** Focus stayed in BODY with no page change: the text went nowhere observable. Undefined when unmeasurable. */
    typedIntoVoid?: boolean;
}

/**
 * Compare two locatorless-type snapshots. The page/focus halves delegate
 * to compareKeyEffect (one truth for fingerprint and focus deltas); the
 * value half reasons about lengths in memory and reports booleans only.
 * Null-tolerant: missing halves degrade to undefined instead of inventing
 * an effect. Evidence only — never a failure by itself.
 */
export function compareTypeEffect(
    before: KeyContext | null,
    after: KeyContext | null,
    expectedLength: number,
    mode: TypeExpectMode,
): TypeEffect {
    const key = compareKeyEffect(before, after);
    const effect: TypeEffect = { ...key };
    const bf = before?.focus ?? null;
    const af = after?.focus ?? null;
    if (!bf || !af) return effect;
    const expected = Number(expectedLength);
    if (mode !== 'keys' && Number.isFinite(expected) && expected > 0) {
        effect.valueApplied = mode === 'set'
            ? af.valueLen === expected
            : af.valueLen - bf.valueLen === expected;
    }
    // The base comparator defaults to no-change when the page is
    // unreadable, so the void verdict needs a readable page to mean
    // anything; without one it stays undefined, never false comfort.
    if (key.readOk) {
        effect.typedIntoVoid = bf.isBody && af.isBody && !key.navigated && !key.domChanged;
    }
    return effect;
}

/**
 * One in-page evaluate returning the document identity: the load stamp
 * (performance.timeOrigin — a new-document clock that changes on every
 * full load) plus the navigation entry type. It is an IIFE: pass it
 * straight to page.evaluate. A number and a small enum string only — no
 * URL, title, markup or values ever leave the page.
 */
export const TRAVERSAL_IDENTITY_SCRIPT = `(() => {
  let loadStamp = 0;
  try {
    const perf = (typeof performance !== 'undefined') ? performance : null;
    const t = perf ? Number(perf.timeOrigin || 0) : 0;
    loadStamp = Number.isFinite(t) ? Math.round(t) : 0;
  } catch (e) { loadStamp = 0; }
  let navType = '';
  try {
    const perf = (typeof performance !== 'undefined') ? performance : null;
    const entries = (perf && (typeof perf.getEntriesByType === 'function')) ? perf.getEntriesByType('navigation') : null;
    const first = (entries && entries[0]) ? entries[0] : null;
    navType = (first && (typeof first.type === 'string')) ? String(first.type).slice(0, 32) : '';
  } catch (e) { navType = ''; }
  return { loadStamp: loadStamp, navType: navType };
})()`;

/** Document identity: when the current document loaded, and how it was reached. */
export interface TraversalIdentity {
    loadStamp: number;
    navType: string;
}

/** Everything a history traversal can observably move: the page plus its identity. */
export interface TraversalContext {
    page: ClickContext | null;
    identity: TraversalIdentity | null;
}

export interface TraversalEffect {
    /** False when the page could not be read before or after the traversal. */
    readOk: boolean;
    /** The URL changed across the traversal. */
    navigated: boolean;
    /** Title, element count, text length or markup hash changed. */
    domChanged: boolean;
    /** False when the document identity could not be read before or after. */
    identityReadOk: boolean;
    /** A new document loaded (load stamp differs) — full back/forward/reload. */
    documentChanged: boolean;
    /** True when the traverse call itself threw (timeout, closed page). */
    navigationError: boolean;
    /** documentChanged || navigated || domChanged. Evidence only — never a failure by itself. */
    effectObserved: boolean;
    /** New runtime error signals observed during the step; absent when unmeasurable. */
    runtimeErrors?: number;
}

/**
 * Compare two traversal snapshots. The page half delegates to
 * compareClickEffect (one truth for fingerprint deltas); the identity half
 * compares load stamps. A stamp of 0 means the clock was unreadable, so two
 * zero stamps never count as a change — only a positive delta does.
 * Null-tolerant: missing halves degrade to readOk/identityReadOk:false and
 * an absent runtimeErrors count instead of inventing an effect.
 */
export function compareTraversalEffect(before: TraversalContext | null, after: TraversalContext | null, threw: boolean): TraversalEffect {
    const page = compareClickEffect(before?.page ?? null, after?.page ?? null);
    const effect: TraversalEffect = {
        readOk: page.readOk,
        navigated: page.navigated,
        domChanged: page.domChanged,
        identityReadOk: false,
        documentChanged: false,
        navigationError: threw === true,
        effectObserved: page.effectObserved,
        ...(page.runtimeErrors === undefined ? {} : { runtimeErrors: page.runtimeErrors }),
    };
    const bi = before?.identity ?? null;
    const ai = after?.identity ?? null;
    if (bi && ai) {
        effect.identityReadOk = true;
        effect.documentChanged = bi.loadStamp !== ai.loadStamp && bi.loadStamp > 0 && ai.loadStamp > 0;
        effect.effectObserved = effect.effectObserved || effect.documentChanged;
    }
    return effect;
}

/**
 * GOTO OBSERVED EFFECT — a goto names where the browser went, not just
 * that the navigation call resolved.
 *
 * The old goto reported ok:true for every resolved navigation. Three
 * landings shared that receipt and meant different things:
 *
 *   - A real move to the requested page (new document, new URL).
 *   - A same-URL re-goto: URL and DOM identical, only the document
 *     identity proves anything happened at all.
 *   - A fallback win: the www/http candidate race landed somewhere the
 *     step never asked for, and nothing said so.
 *
 * And the failure side was blind in the other direction: gotoResilient
 * treats HTTP error statuses as failures, but the browser DID navigate
 * to the error page — "reached server, page missing" (HTTP 404, new
 * document) is a different diagnosis from "never left" (DNS, closed
 * port), and the receipt now carries the difference.
 *
 * The page half delegates to compareClickEffect and the identity half
 * mirrors compareTraversalEffect (one truth for fingerprint and load-
 * stamp deltas); the goto half adds the landing verdict — did the
 * landed URL match the requested one — and the observed HTTP status.
 * Evidence only, never a new failure: success stays success, failure
 * keeps its reason, both gain observed state.
 */

/** Observed effect of one `goto` step: where the browser went and what it found. */
export interface GotoEffect {
    /** False when the page could not be read before or after the goto. */
    readOk: boolean;
    /** The URL changed across the goto. */
    navigated: boolean;
    /** Title, element count, text length or markup hash changed. */
    domChanged: boolean;
    /** False when the document identity could not be read before or after. */
    identityReadOk: boolean;
    /** A new document loaded — the proof a same-URL goto actually re-navigated. */
    documentChanged: boolean;
    /**
     * The landed URL matches the requested URL (normalized). False when
     * the after-half is unreadable — an unmeasured landing never counts
     * as requested.
     */
    landedOnRequested: boolean;
    /** Observed HTTP verdict of the attempt; absent when unmeasured. */
    httpStatus?: number;
    /** documentChanged || navigated || domChanged. Evidence only — never a failure by itself. */
    effectObserved: boolean;
    /** New runtime error signals observed during the step; absent when unmeasurable. */
    runtimeErrors?: number;
}

/**
 * Normalize a navigation URL for landing comparison: trimmed, scheme and
 * host lowercased, default ports dropped, trailing slashes stripped. The
 * path keeps its case, the query and hash are kept — they are part of
 * "where asked". Unparseable landings (about:blank and friends) degrade
 * to a trimmed string instead of throwing.
 */
export function normalizeGotoLanding(raw: string): string {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    // Only hierarchical web URLs decompose; about:blank, data: and other
    // opaque landings degrade to a trimmed string instead of a mangled
    // scheme:// form.
    if (!/^https?:\/\//i.test(s)) return s.replace(/\/+$/, '');
    try {
        const u = new URL(s);
        const scheme = String(u.protocol || '').toLowerCase();
        const host = String(u.hostname || '').toLowerCase();
        const port = String(u.port || '');
        const defaultPort =
            (scheme === 'http:' && port === '80') ||
            (scheme === 'https:' && port === '443');
        const path = String(u.pathname || '').replace(/\/+$/, '');
        return `${scheme}//${host}${defaultPort || !port ? '' : `:${port}`}${path}${u.search || ''}${u.hash || ''}`;
    } catch {
        return s.replace(/\/+$/, '');
    }
}

/**
 * Compare two goto snapshots. Null-tolerant: missing halves degrade to
 * readOk/identityReadOk:false, landedOnRequested:false and absent counts
 * instead of inventing an effect. The HTTP verdict is validated — only a
 * real 100-599 integer passes through.
 */
export function compareGotoEffect(
    before: TraversalContext | null,
    after: TraversalContext | null,
    requestedUrl: string,
    httpStatus?: number,
): GotoEffect {
    const page = compareClickEffect(before?.page ?? null, after?.page ?? null);
    const effect: GotoEffect = {
        readOk: page.readOk,
        navigated: page.navigated,
        domChanged: page.domChanged,
        identityReadOk: false,
        documentChanged: false,
        landedOnRequested: false,
        effectObserved: page.effectObserved,
        ...(page.runtimeErrors === undefined ? {} : { runtimeErrors: page.runtimeErrors }),
    };
    const bi = before?.identity ?? null;
    const ai = after?.identity ?? null;
    if (bi && ai) {
        effect.identityReadOk = true;
        effect.documentChanged = bi.loadStamp !== ai.loadStamp && bi.loadStamp > 0 && ai.loadStamp > 0;
        effect.effectObserved = effect.effectObserved || effect.documentChanged;
    }
    const landed = after?.page?.fingerprint?.url;
    if (typeof landed === 'string' && landed) {
        effect.landedOnRequested = normalizeGotoLanding(landed) === normalizeGotoLanding(requestedUrl);
    }
    if (typeof httpStatus === 'number' && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) {
        effect.httpStatus = httpStatus;
    }
    return effect;
}

/** Observed effect of one `wait` step: what happened DURING the sleep. */
export interface WaitEffect {
    /** False when the page could not be read before or after the wait. */
    readOk: boolean;
    /** The URL changed while waiting (an unexpected navigation). */
    navigated: boolean;
    /** Title, element count, text length or markup hash changed while waiting. */
    domChanged: boolean;
    /** navigated || domChanged. Evidence only — never a failure by itself. */
    effectObserved: boolean;
    /** Measured sleep duration in ms. Absent when unmeasurable. */
    elapsedMs?: number;
    /**
     * New runtime error signals (pageerror + console-error + requestfailed)
     * observed during the wait. Absent when telemetry halves are missing or
     * a counter reset makes the delta meaningless.
     */
    runtimeErrors?: number;
}

/**
 * Compare two wait snapshots. The page halves delegate to
 * compareClickEffect (one truth for fingerprint deltas); the elapsed half
 * only validates the measured sleep. A quiet wait is reported, never
 * failed: plenty of legitimate waits observe nothing, and verification is
 * evidence, not a new failure mode. Null-tolerant: missing halves degrade
 * to readOk:false and absent counts instead of inventing an effect.
 */
export function compareWaitEffect(before: ClickContext | null, after: ClickContext | null, elapsedMs: number): WaitEffect {
    const page = compareClickEffect(before, after);
    const effect: WaitEffect = {
        readOk: page.readOk,
        navigated: page.navigated,
        domChanged: page.domChanged,
        effectObserved: page.effectObserved,
        ...(page.runtimeErrors === undefined ? {} : { runtimeErrors: page.runtimeErrors }),
    };
    if (typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) && elapsedMs >= 0) {
        effect.elapsedMs = Math.round(elapsedMs);
    }
    return effect;
}

/**
 * ASSERT OBSERVED STATE — an assert names what the page showed, not just
 * whether a waitFor threw.
 *
 * The old assert waited for visible and reported ok:true, or threw a raw
 * Playwright timeout whose call log was the only evidence. Three diseases:
 *
 *   - A selector matching hidden-only elements failed as
 *     'element_not_found' — the element EXISTS, so re-query cures nothing.
 *   - A failure carried no counts, so the planner could not distinguish
 *     "0 matched" from "5 matched but hidden" from "page never settled".
 *   - The raw call log embedded live page markup into the receipt, leaking
 *     page content (possibly sensitive) into logs and reports.
 *
 * Asserts now observe the page after the wait resolves: how many nodes
 * matched, how many are visible. Success carries the counts; failure names
 * the observed state (matched=N visible=M) with the reason that cures it —
 * 'element_not_found' when nothing matched, 'element_hidden' when nodes
 * matched but none are visible. Counts only: the receipt never embeds page
 * text or markup. Fail-fast run semantics are unchanged — a failed assert
 * still stops the run; it just says what it saw first.
 */

/** What an assert step asks the page for. Selector wins, exactly like before. */
export interface AssertTarget {
    kind: 'selector' | 'text' | 'missing';
    value: string;
}

export function parseAssertTarget(a: any): AssertTarget {
    const selector = typeof a?.selector === 'string' ? a.selector : '';
    const text = typeof a?.text === 'string' ? a.text : '';
    if (selector) return { kind: 'selector', value: selector };
    if (text) return { kind: 'text', value: text };
    return { kind: 'missing', value: '' };
}

/** What the page showed for an assert target. Counts only, never content. */
export interface AssertObservation {
    /** Nodes matching the selector/text query. */
    matched: number;
    /** Of the checked nodes, how many are visible. */
    visible: number;
    /** Nodes actually visibility-checked (capped). */
    checked: number;
    /** True when matched exceeded the check cap. */
    truncated: boolean;
}

/** Visibility probes are bounded: checking 10 answers "any visible" cheaply. */
export const ASSERT_VISIBILITY_CHECK_CAP = 10;

/** Minimal locator surface: real Playwright locators and test fakes fit. */
export interface AssertLocatorOps {
    /** Total nodes matching the query. May throw (e.g. bad selector syntax). */
    count(): Promise<number>;
    /** Whether the i-th match is visible. Must not wait. */
    isVisibleAt(i: number): Promise<boolean>;
}

/**
 * Observe the page for an assert target. Errors propagate: a throwing count
 * (bad selector syntax, dead page) is itself the diagnosis, and the caller
 * maps it — observation never invents a state it could not read.
 */
export async function observeAssertState(ops: AssertLocatorOps): Promise<AssertObservation> {
    const matched = Math.max(0, Math.floor(Number(await ops.count())));
    const checked = Math.min(matched, ASSERT_VISIBILITY_CHECK_CAP);
    let visible = 0;
    for (let i = 0; i < checked; i += 1) {
        if (await ops.isVisibleAt(i)) visible += 1;
    }
    return { matched, visible, checked, truncated: matched > checked };
}

/** Verdict over an assert observation: pass needs one visible node. */
export interface AssertVerdict {
    pass: boolean;
    reason: FailureReason;
    /** Structured counts, safe to store: no page text or markup. */
    detail: string;
}

export function evaluateAssertObservation(obs: AssertObservation): AssertVerdict {
    const matched = Math.max(0, Math.floor(Number(obs.matched) || 0));
    const visible = Math.max(0, Math.floor(Number(obs.visible) || 0));
    const suffix = obs.truncated ? ` checked=${obs.checked} truncated` : '';
    if (visible > 0) {
        return { pass: true, reason: 'unknown', detail: `assert_ok matched=${matched} visible=${visible}${suffix}` };
    }
    if (matched === 0) {
        return { pass: false, reason: 'element_not_found', detail: `assert_failed matched=0 visible=0` };
    }
    return { pass: false, reason: 'element_hidden', detail: `assert_failed matched=${matched} visible=0${suffix}` };
}

/** True when the error is a selector-syntax failure, not a page state. */
export function isSelectorSyntaxError(error: unknown): boolean {
    const msg = String((error as any)?.message ?? error ?? '');
    return /while parsing .* selector|CSS\.escape|unexpected token.*parsing|invalid selector/i.test(msg);
}

/**
 * OBSERVATION RECEIPTS — screenshot/extract_text/get_elements report what
 * they observed, not just that they ran.
 *
 * The observation actions were the last readers without self-describing
 * receipts (proven by probe-m15 against real Chromium, pre-fix):
 *
 *   - An `extract_text` whose selector matched nothing reported ok:true
 *     with the literal text "Element not found" as its message — a miss
 *     indistinguishable from a page that really says that. The planner
 *     cannot re-query what looks like success.
 *   - An `extract_text` with an invalid selector let the in-page
 *     querySelector throw, so the whole RUN aborted with reason
 *     'unknown' and a raw Playwright call log as the message — the
 *     scroll_to_element disease one action over, already cured there by
 *     reading the target state in-page instead of letting it throw.
 *   - A `get_elements` reported a bare ok:true whether the page held 50
 *     controls, none, or 500 (silently capped at 100): empty and
 *     truncated reads shared one receipt.
 *   - A `screenshot` reported a bare ok:true with no record of the
 *     capture itself: an empty capture would arrive as success.
 *
 * Observations now carry their own evidence, same philosophy as every
 * prior receipt: counts and flags, never new page content (extract_text
 * keeps its pre-existing text payload — that IS the action — but the
 * miss/invalid verdicts are structured counts, never content).
 *
 *   - buildExtractReadEval: self-contained in-page read returning
 *     { found, invalid, text }. Invalid syntax returns invalid:true
 *     instead of throwing, so a bad selector fails its STEP with
 *     'invalid_selector' instead of aborting the run with 'unknown'.
 *   - evaluateExtractObservation: the read -> verdict. A miss fails as
 *     'element_not_found' (cure: re-query, wait, different selector)
 *     and the run continues — the goto/scroll_to_element precedent for
 *     a step-scoped failure. An unreadable read keeps the action's own
 *     verdict, marked unverified: verification is evidence, not a new
 *     failure mode.
 *   - ELEMENTS_READ_SCRIPT: one in-page evaluate returning
 *     { total, elements } with the existing mapping untouched. The
 *     receipt carries elementCount/totalMatched/truncated: an empty
 *     page is a valid observation (ok:true, count 0), a crowded page
 *     says it was cut.
 *   - captureEvidence: base64 capture -> { captured, captureBytes }.
 *     Evidence-only like clicks: a throw still fails fast through the
 *     shared outer catch, but an empty capture is reported, never
 *     failed — there is no curing reason for it, so the planner
 *     decides from the flag.
 */

/** What the in-page extract read script reports. */
export interface ExtractObservation {
    found: boolean;
    /** True when the selector itself is syntactically invalid — a planner bug, not a missing element. */
    invalid: boolean;
    /** Trimmed text of the matched element. */
    text: string;
}

/**
 * Build a self-contained in-page evaluate that reads a selector's text.
 * Complete expression — pass it straight to page.evaluate with NO second
 * argument; the selector is baked in as a JSON literal so hostile text
 * stays inert. Resolves to ExtractObservation, never null, never throws.
 */
export function buildExtractReadEval(selector: string): string {
    const fn = `(arg) => {
  let el = null;
  try { el = document.querySelector(arg.selector); } catch (err) { return { found: false, invalid: true, text: '' }; }
  if (!el) return { found: false, invalid: false, text: '' };
  return { found: true, invalid: false, text: (el.textContent || '').trim() };
}`;
    return `(${fn})(${JSON.stringify({ selector: String(selector === null || selector === undefined ? '' : selector) })})`;
}

/** Verdict over an extract observation: a miss names its cure. */
export interface ExtractVerdict {
    ok: boolean;
    reason: FailureReason;
    found: boolean;
    /** False only when the read itself was unreadable — the step keeps the action's verdict. */
    verified: boolean;
    /** Observed text length; -1 when nothing could be read. */
    textLength: number;
    /** The observed text (flows to the event payload, never the receipt). */
    text: string;
    /** Structured counts, safe to store: no page text or markup. */
    detail: string;
}

export function evaluateExtractObservation(obs: ExtractObservation | null | undefined, selector: string): ExtractVerdict {
    const sel = String(selector === null || selector === undefined ? '' : selector).slice(0, 120);
    if (!obs || typeof obs !== 'object') {
        return { ok: true, reason: 'unknown', found: false, verified: false, textLength: -1, text: '', detail: 'extract_unverified' };
    }
    if ((obs as any).invalid === true) {
        return { ok: false, reason: 'invalid_selector', found: false, verified: true, textLength: -1, text: '', detail: `extract_invalid_selector ${JSON.stringify(sel)} could not be parsed` };
    }
    if ((obs as any).found !== true) {
        return { ok: false, reason: 'element_not_found', found: false, verified: true, textLength: -1, text: '', detail: `extract_target_not_found ${JSON.stringify(sel)}` };
    }
    const text = String((obs as any).text || '');
    return { ok: true, reason: 'unknown', found: true, verified: true, textLength: text.length, text, detail: `extract_ok len=${text.length}` };
}

/** Cap on interactive elements returned per get_elements read — the page may hold more. */
export const ELEMENTS_RETURN_CAP = 100;

/**
 * One in-page evaluate returning the interactive-element read: the total
 * matched before the cap plus the capped visible-only list. IIFE — pass
 * it straight to page.evaluate. The element mapping matches the compiled
 * read it replaces field-for-field; only the { total, elements } wrapper
 * is new.
 */
export const ELEMENTS_READ_SCRIPT = `(() => {
  const interactiveSelectors = 'a, button, input, select, textarea, [role=button], [onclick], [tabindex]';
  const els = Array.from(document.querySelectorAll(interactiveSelectors));
  const total = els.length;
  const elements = els.slice(0, ${ELEMENTS_RETURN_CAP}).map((el, i) => {
    const rect = el.getBoundingClientRect();
    return {
      index: i,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().substring(0, 100),
      type: el.type || undefined,
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: rect.width > 0 && rect.height > 0
    };
  }).filter(e => e.visible);
  return { total, elements };
})()`;

/** What the in-page elements read reports: counts around the returned list. */
export interface ElementsObservation {
    /** Interactive nodes matched before the cap. */
    total: number;
    /** Elements actually returned (capped, visible-only). */
    returned: number;
}

/** Verdict over an elements read: an empty page is data, a cut page says so. */
export interface ElementsVerdict {
    elementCount: number;
    totalMatched: number;
    truncated: boolean;
}

export function evaluateElementsObservation(obs: ElementsObservation | null | undefined): ElementsVerdict {
    const total = Math.max(0, Math.floor(Number((obs as any)?.total) || 0));
    const returned = Math.max(0, Math.floor(Number((obs as any)?.returned) || 0));
    return { elementCount: returned, totalMatched: total, truncated: total > ELEMENTS_RETURN_CAP };
}

/**
 * A `ui_audit` is the grounding re-scan: the DOM fingerprint plus the
 * interactive-element read, summarized as counts. It backs
 * `browser_get_state` and `browser_snapshot`, so a bare ok:true there
 * answered "what is on screen?" with nothing. An unreadable page
 * reports scanned:false, never fails - there is no curing reason for
 * it, so the planner decides from the flag (the screenshot precedent).
 */
export interface UiAuditObservation {
    fingerprint: ClickFingerprint | null;
    elements: ElementsObservation | null;
}

/** Verdict over a ui_audit re-scan: page shape plus element counts. */
export interface UiAuditVerdict {
    /** False when the DOM fingerprint could not be read. */
    scanned: boolean;
    /** DOM node count; -1 when unreadable. */
    domNodes: number;
    /** Rendered text length; -1 when unreadable. */
    textLength: number;
    elementCount: number;
    totalMatched: number;
    truncated: boolean;
}

export function evaluateUiAuditObservation(obs: UiAuditObservation | null | undefined): UiAuditVerdict {
    const fp = (obs as any)?.fingerprint ?? null;
    const scanned = !!fp && typeof fp.url === 'string';
    const domNodes = scanned ? Math.max(0, Math.floor(Number(fp.elements) || 0)) : -1;
    const textLength = scanned ? Math.max(0, Math.floor(Number(fp.textLength) || 0)) : -1;
    const els = evaluateElementsObservation((obs as any)?.elements ?? null);
    return { scanned, domNodes, textLength, elementCount: els.elementCount, totalMatched: els.totalMatched, truncated: els.truncated };
}

/** What a screenshot capture observed: integrity of the bytes, never the pixels. */
export interface CaptureEvidence {
    captured: boolean;
    /** Decoded JPEG byte length; 0 when nothing was captured. */
    captureBytes: number;
}

export function captureEvidence(base64: string | null | undefined): CaptureEvidence {
    const s = typeof base64 === 'string' ? base64 : '';
    if (!s) return { captured: false, captureBytes: 0 };
    const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
    const bytes = Math.max(0, Math.floor((s.length * 3) / 4) - pad);
    if (bytes <= 0) return { captured: false, captureBytes: 0 };
    return { captured: true, captureBytes: bytes };
}

/** Bounded preview length for an evaluate result: the receipt names the outcome, it never dumps an unbounded page value into logs. */
export const EVALUATE_RESULT_PREVIEW_MAX = 200;

/** What an `evaluate` script returned, summarized for the receipt. */
export interface EvaluateResultSummary {
    resultType: 'undefined' | 'null' | 'string' | 'number' | 'boolean' | 'bigint' | 'array' | 'object' | 'function' | 'symbol';
    /** Length of the full serialized form; the preview may be shorter. */
    resultLength: number;
    /** First EVALUATE_RESULT_PREVIEW_MAX chars of the serialized form. */
    resultPreview: string;
}

/**
 * Summarize an arbitrary evaluate return for the receipt. Never throws
 * and never leaks unbounded content: circular structures degrade to a
 * marker, huge values are measured but cut. Strings pass through as-is
 * (truncated); anything else is JSON-shaped when possible,
 * String()-shaped otherwise.
 */
export function summarizeEvaluateResult(value: unknown): EvaluateResultSummary {
    let resultType: EvaluateResultSummary['resultType'] = 'object';
    if (value === undefined) resultType = 'undefined';
    else if (value === null) resultType = 'null';
    else if (typeof value === 'string') resultType = 'string';
    else if (typeof value === 'number') resultType = 'number';
    else if (typeof value === 'boolean') resultType = 'boolean';
    else if (typeof value === 'bigint') resultType = 'bigint';
    else if (Array.isArray(value)) resultType = 'array';
    else if (typeof value === 'function') resultType = 'function';
    else if (typeof value === 'symbol') resultType = 'symbol';
    let serialized = '';
    try {
        if (typeof value === 'string') {
            serialized = value;
        } else if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
            serialized = String(value);
        } else {
            const seen = new Set<object>();
            const hit = JSON.stringify(value, (_k, v) => {
                if (v !== null && typeof v === 'object') {
                    if (seen.has(v)) return '[circular]';
                    seen.add(v);
                }
                return v;
            });
            serialized = typeof hit === 'string' ? hit : String(value);
        }
    } catch {
        try { serialized = String(value); } catch { serialized = ''; }
    }
    return {
        resultType,
        resultLength: serialized.length,
        resultPreview: serialized.slice(0, EVALUATE_RESULT_PREVIEW_MAX),
    };
}
