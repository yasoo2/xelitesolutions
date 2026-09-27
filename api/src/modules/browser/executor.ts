import type { Locator, Page } from 'playwright';
import type { FailureReason } from './types';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';
import { gotoResilient, probeNavigationReadiness, type NavigationReadiness } from './navigation';
import { buildExtractReadEval, buildScrollIntoViewEval, buildScrollTargetReadEval, buildSelectReadEval, buildSelectSetEval, captureEvidence, CLICK_FINGERPRINT_SCRIPT, classifyActionError, compareClickEffect, compareKeyEffect, compareScrollEffect, compareTraversalEffect, compareWaitEffect, ELEMENTS_READ_SCRIPT, ensureTypedValue, evaluateElementsObservation, evaluateExtractObservation, KEY_FOCUS_SCRIPT, SCROLL_SNAPSHOT_SCRIPT, TRAVERSAL_IDENTITY_SCRIPT, typeActionText, type ClickContext, type KeyContext, type KeyFocus, type ScrollSnapshot, type TraversalContext, type TraversalIdentity, type AssertObservation, parseAssertTarget, observeAssertState, evaluateAssertObservation, isSelectorSyntaxError, summarizeEvaluateResult } from './actionVerification';
import { getBrowserTelemetryErrorCounts } from './telemetry';
import { getBrowserSession, setStreamMask, touchSession, withBrowserConcurrency } from './manager';
import { getSessionSecret, getUserSecret } from '../services/secrets';
import { AdvancedInteractionSystem } from './interactions';
import { normalizeUrlForGoto } from '../../shared/utils/url';

type Action =
  | { type: 'goto'; url: string; optional?: boolean }
  | { type: 'click'; selector?: string; role?: string; name?: string; text?: string; optional?: boolean; x?: number; y?: number }
  | { type: 'hover'; selector?: string; role?: string; name?: string; text?: string; optional?: boolean; x?: number; y?: number }
  | { type: 'type'; selector?: string; role?: string; name?: string; text: string; optional?: boolean; x?: number; y?: number }
  | { type: 'fill'; selector?: string; role?: string; name?: string; text: string; optional?: boolean; x?: number; y?: number }
  | { type: 'key'; key: string; optional?: boolean }
  | { type: 'evaluate'; script: string; optional?: boolean }
  | { type: 'scroll'; direction: 'down' | 'up'; amount?: number; optional?: boolean }
  | { type: 'wait'; ms: number; optional?: boolean }
  | { type: 'assert'; selector?: string; text?: string; optional?: boolean }
  | { type: 'ui_audit'; optional?: boolean }
  | { type: 'back'; optional?: boolean }
  | { type: 'forward'; optional?: boolean }
  | { type: 'reload'; optional?: boolean }
  | { type: 'screenshot'; optional?: boolean }
  | { type: 'extract_text'; selector?: string; optional?: boolean }
  | { type: 'get_elements'; optional?: boolean }
  | { type: 'scroll_to_element'; selector: string; optional?: boolean }
  | { type: 'thought'; text: string; optional?: boolean }
  | { type: 'click_coordinates'; x: number; y: number; optional?: boolean };

const SECRET_TOKEN_RE = /^\{\{\s*SECRET\s*:\s*([A-Z0-9_]+)\s*\}\}$/;

function now() {
  return Date.now();
}

function stepId(i: number) {
  return `step_${i + 1}`;
}

function isSameSiteAllowed(allowedOrigin: string | null, nextUrl: string) {
  if (!DEFAULT_BROWSER_CONFIG.strictSameSite) return true;
  if (!allowedOrigin) return true;
  try {
    const u = new URL(nextUrl);
    return u.origin === allowedOrigin;
  } catch {
    return false;
  }
}


function locatorForAction(page: Page, a: any): Locator | null {
  if (a?.selector) return page.locator(String(a.selector));
  if (a?.role && a?.name) return (page as any).getByRole(String(a.role), { name: String(a.name) });
  if (a?.text) return page.getByText(String(a.text), { exact: false });
  return null;
}

async function findCredentialField(page: Page, kind: 'email' | 'password') {
  const css =
    kind === 'email'
      ? [
        'input[type="email"]',
        'input[autocomplete="email"]',
        'input[name*="email" i]',
        'input[id*="email" i]',
        'input[name="login"]',
        'input#login_field',
        'input[id*="login" i]',
        'input[name*="user" i]',
        'input[id*="user" i]',
        'input[placeholder*="email" i]',
        'input[aria-label*="email" i]',
        'input[placeholder*="mail" i]',
        'input[aria-label*="mail" i]',
        'input[placeholder*="ايميل" i]',
        'input[placeholder*="إيميل" i]',
        'input[placeholder*="البريد" i]',
        'input[aria-label*="ايميل" i]',
        'input[aria-label*="إيميل" i]',
        'input[aria-label*="البريد" i]',
      ]
      : [
        'input[type="password"]',
        'input[autocomplete="current-password"]',
        'input[autocomplete="new-password"]',
        'input[name*="pass" i]',
        'input[id*="pass" i]',
        'input[placeholder*="pass" i]',
        'input[aria-label*="pass" i]',
        'input[placeholder*="password" i]',
        'input[aria-label*="password" i]',
        'input[placeholder*="كلمة" i]',
        'input[placeholder*="المرور" i]',
        'input[placeholder*="باسورد" i]',
        'input[aria-label*="كلمة" i]',
        'input[aria-label*="المرور" i]',
        'input[aria-label*="باسورد" i]',
      ];

  for (const sel of css) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count().catch(() => 0)) === 0) continue;
      await loc.waitFor({ state: 'visible', timeout: 800 }).catch(() => null);
      if (await loc.isVisible().catch(() => false)) return page.locator(sel);
    } catch { }
  }

  const labels =
    kind === 'email'
      ? [/email/i, /e-mail/i, /mail/i, /user(name)?/i, /login/i, /البريد/i, /ايميل/i, /إيميل/i]
      : [/password/i, /passcode/i, /كلمة\s*المرور/i, /باسورد/i, /باسوورد/i, /الباسورد/i, /الباسوورد/i];

  for (const r of labels) {
    try {
      const loc = page.getByLabel(r, { exact: false }).first();
      if ((await loc.count().catch(() => 0)) === 0) continue;
      await loc.waitFor({ state: 'visible', timeout: 800 }).catch(() => null);
      if (await loc.isVisible().catch(() => false)) return loc;
    } catch { }
  }

  const roleNames =
    kind === 'email'
      ? [/email/i, /e-mail/i, /mail/i, /user(name)?/i, /login/i, /البريد/i, /ايميل/i, /إيميل/i]
      : [/password/i, /passcode/i, /كلمة\s*المرور/i, /باسورد/i, /باسوورد/i, /الباسورد/i, /الباسوورد/i];

  for (const r of roleNames) {
    try {
      const loc = (page as any).getByRole('textbox', { name: r }).first();
      if ((await loc.count().catch(() => 0)) === 0) continue;
      await loc.waitFor({ state: 'visible', timeout: 800 }).catch(() => null);
      if (await loc.isVisible().catch(() => false)) return loc;
    } catch { }
  }

  return null;
}

/**
 * Snapshot the focused element for key effect evidence. Never throws — an
 * unreadable page or unexpected shape degrades to null and the comparator
 * reports the focus as unmeasured, never as unchanged.
 */
async function snapshotKeyFocus(page: Page): Promise<KeyFocus | null> {
  try {
    const f: any = await page.evaluate(KEY_FOCUS_SCRIPT);
    if (!f || typeof f.tag !== 'string') return null;
    const lens = [f.idLen, f.classLen, f.nameLen, f.valueLen];
    if (lens.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
    return {
      hasFocus: f.hasFocus === true,
      tag: String(f.tag),
      idLen: f.idLen,
      classLen: f.classLen,
      nameLen: f.nameLen,
      valueLen: f.valueLen,
      isBody: f.isBody === true,
    };
  } catch { return null; }
}

async function boxFor(locator: Locator) {
  try {
    await locator.first().scrollIntoViewIfNeeded();
  } catch { }
  try {
    const b = await locator.first().boundingBox();
    if (!b) return null;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    return null;
  }
}

/**
 * Snapshot the page for click effect evidence: one lightweight DOM
 * fingerprint plus the session's cumulative runtime-error counters. Never
 * throws — an unreadable page or missing telemetry degrades to null fields
 * and the comparator reports the step as unmeasured, never as no-effect.
 */
async function snapshotClickContext(page: Page, sessionId: string): Promise<ClickContext | null> {
  let fingerprint: ClickContext['fingerprint'] = null;
  try {
    const fp: any = await page.evaluate(CLICK_FINGERPRINT_SCRIPT);
    if (fp && typeof fp.url === 'string') {
      fingerprint = {
        url: String(fp.url),
        title: String(fp.title || ''),
        elements: Number(fp.elements || 0),
        textLength: Number(fp.textLength || 0),
        htmlHash: String(fp.htmlHash || ''),
      };
    }
  } catch { /* unreadable page — the comparator reports readOk:false */ }
  let errors: ClickContext['errors'] = null;
  try {
    const counts = getBrowserTelemetryErrorCounts(sessionId);
    if (counts) errors = { js: counts.js, console: counts.console, network: counts.network };
  } catch { /* no telemetry — runtimeErrors stays unmeasurable */ }
  if (!fingerprint && !errors) return null;
  return { fingerprint, errors };
}

/**
 * Snapshot the document identity for traversal effect evidence. Never
 * throws — an unreadable page degrades to null and the comparator reports
 * the step as identity-unmeasured, never as unchanged.
 */
async function snapshotTraversalIdentity(page: Page): Promise<TraversalIdentity | null> {
  try {
    const r: any = await page.evaluate(TRAVERSAL_IDENTITY_SCRIPT);
    if (!r || typeof r.loadStamp !== 'number' || !Number.isFinite(r.loadStamp)) return null;
    return { loadStamp: r.loadStamp, navType: typeof r.navType === 'string' ? r.navType : '' };
  } catch { return null; }
}

/**
 * Run one history-traversal step (back/forward/reload) with observed-effect
 * evidence: the page fingerprint plus the document identity are captured
 * around the traverse call, the thrown/not-thrown outcome is recorded, and
 * readiness is probed instead of slept. The Playwright response is NOT
 * trusted — real traversals on non-network pages resolve null exactly like
 * empty-history no-ops do, so only observed page state counts. Never
 * throws; evidence only, never a new failure.
 */
async function observeTraversalStep(
  page: Page,
  sessionId: string,
  traverse: () => Promise<unknown>,
): Promise<{
  navigated: boolean | undefined;
  domChanged: boolean | undefined;
  documentChanged: boolean | undefined;
  effectObserved: boolean | undefined;
  navigationError: boolean;
  runtimeErrors: number | undefined;
  readiness: NavigationReadiness | null;
}> {
  const before: TraversalContext = {
    page: await snapshotClickContext(page, sessionId),
    identity: await snapshotTraversalIdentity(page),
  };
  let threw = false;
  try {
    await traverse();
  } catch { threw = true; }
  let readiness: NavigationReadiness | null = null;
  try {
    readiness = await probeNavigationReadiness(page, {});
  } catch { readiness = null; }
  const after: TraversalContext = {
    page: await snapshotClickContext(page, sessionId),
    identity: await snapshotTraversalIdentity(page),
  };
  const effect = compareTraversalEffect(before, after, threw);
  return {
    navigated: effect.readOk ? effect.navigated : undefined,
    domChanged: effect.readOk ? effect.domChanged : undefined,
    documentChanged: effect.identityReadOk ? effect.documentChanged : undefined,
    effectObserved: (effect.readOk || effect.identityReadOk) ? effect.effectObserved : undefined,
    navigationError: effect.navigationError,
    runtimeErrors: effect.runtimeErrors,
    readiness,
  };
}

/**
 * Snapshot the page scroll geometry for scroll effect evidence. Never
 * throws — an unreadable page degrades to null and the comparator reports
 * the step as unmeasured, never as unmoved.
 */
async function snapshotScrollPosition(page: Page): Promise<ScrollSnapshot | null> {
  try {
    const s: any = await page.evaluate(SCROLL_SNAPSHOT_SCRIPT);
    if (!s) return null;
    const nums = [s.x, s.y, s.innerW, s.innerH, s.scrollW, s.scrollH];
    if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
    return { x: s.x, y: s.y, innerW: s.innerW, innerH: s.innerH, scrollW: s.scrollW, scrollH: s.scrollH };
  } catch { return null; }
}

/** Center the mouse so a wheel pulse scrolls the main view, not a nested region. Never throws. */
async function centerMouseForScroll(page: Page, interactions: AdvancedInteractionSystem) {
  try {
    const vp = page.viewportSize();
    if (vp) {
      const currentX = (interactions as any).lastMousePosition.x || 0;
      const currentY = (interactions as any).lastMousePosition.y || 0;
      await interactions.naturalMouseMove(page, currentX, currentY, vp.width / 2, vp.height / 2, 200);
    }
  } catch { }
}

async function tryDismissOverlays(page: Page) {
  const candidates = [
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button:has-text("Accept all")',
    'button:has-text("أوافق")',
    'button:has-text("قبول")',
    'button:has-text("موافق")',
    'button:has-text("رفض الكل")',
    'button:has-text("Reject all")',
    'div[role="button"]:has-text("Accept all")',
    'div[role="button"]:has-text("I agree")',
    'button:has-text("Before you continue")', // Google sometimes has this as title, button is 'Accept'
    'button[aria-label="Accept all"]',
  ];
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      await loc.click({ timeout: 1500 });
      await page.waitForTimeout(250);
    } catch { }
  }
}

async function screenshotJpegBase64(page: Page, maskLocators?: Locator[]) {
  const buf = await page.screenshot({
    type: 'jpeg',
    quality: 65,
    animations: 'disabled',
    mask: maskLocators && maskLocators.length ? maskLocators : undefined,
  });
  return Buffer.from(buf).toString('base64');
}

export async function executePlannedActions(params: {
  userId: string;
  sessionId: string;
  actions: Action[];
  stepOffset?: number;
  emitFinalReport?: boolean;
}) {
  return await withBrowserConcurrency(async () => {
    const userId = String(params.userId || '').trim();
    const sessionId = String(params.sessionId || '').trim();
    const actions = Array.isArray(params.actions) ? params.actions : [];
    const stepOffset = Math.max(0, Math.floor(Number(params.stepOffset || 0)));
    const emitFinalReport = params.emitFinalReport !== false;
    const cfg = DEFAULT_BROWSER_CONFIG;

    const s = await getBrowserSession(sessionId);

    const page = s.page;
    const interactions = new AdvancedInteractionSystem();

    // [New] Connect interaction events to broadcasts for real-time visualization
    interactions.on('mouse-move', (data) => {
      broadcastBrowserEvent(sessionId, { type: 'cursor_move', ts: now(), x: data.x, y: data.y });
    });
    interactions.on('click', (data) => {
      broadcastBrowserEvent(sessionId, { type: 'action_feedback', ts: now(), event: 'click', x: data.x, y: data.y });
    });
    interactions.on('scroll', (data) => {
      broadcastBrowserEvent(sessionId, { type: 'action_feedback', ts: now(), event: 'scroll', direction: data.direction });
    });

    try {
      broadcastBrowserEvent(sessionId, {
        type: 'session_status',
        ts: now(),
        sessionId,
        url: page.url(),
        workerStatus: 'running',
      });
    } catch { }
    const results: Array<{ stepId: string; name: string; ok: boolean; reason?: FailureReason; message?: string; resultType?: string; resultLength?: number; verified?: boolean; valueMatch?: boolean; repaired?: boolean; navigated?: boolean; domChanged?: boolean; focusChanged?: boolean; documentChanged?: boolean; navigationError?: boolean; effectObserved?: boolean; runtimeErrors?: number; scrolled?: boolean; scrollDeltaY?: number; atEdge?: boolean; inViewport?: boolean; elapsedMs?: number; matched?: number; visibleCount?: number; found?: boolean; textLength?: number; elementCount?: number; totalMatched?: number; truncated?: boolean; captured?: boolean; captureBytes?: number }> = [];
    const evidence: Array<{ kind: 'screenshot'; jpegBase64: string; ts: number; stepId: string }> = [];

    for (let i = 0; i < Math.min(cfg.maxSteps, actions.length); i += 1) {
      touchSession(sessionId);
      const a: any = actions[i];
      const name = String(a?.type || 'unknown');
      const sid = stepId(i + stepOffset);
      try {
        const rawText = (name === 'type' || name === 'fill') ? String(a?.text || '') : '';
        const secretMatch = (name === 'type' || name === 'fill') ? rawText.match(SECRET_TOKEN_RE) : null;
        const summary =
          name === 'goto'
            ? `goto ${normalizeUrlForGoto(a?.url, (() => { try { return page.url(); } catch { return ''; } })()).trim()}`
            : (name === 'type' || name === 'fill')
              ? secretMatch
                ? `${name} (secret:${String(secretMatch[1] || '').trim() || 'KEY'})`
                : `${name} (len=${rawText.length})`
              : name;
        broadcastBrowserEvent(sessionId, { type: 'action_sent', ts: now(), actionId: sid, actionType: name, summary });
      } catch { }
      broadcastBrowserEvent(sessionId, { type: 'step_start', stepId: sid, name, ts: now() });
      try {
        broadcastBrowserEvent(sessionId, { type: 'action_ack', ts: now(), actionId: sid, actionType: name });
      } catch { }

      let mask: Locator[] = [];
      try {
        if (name === 'goto') {
          const optional = Boolean(a?.optional);
          const url = normalizeUrlForGoto(a?.url, (() => { try { return page.url(); } catch { return ''; } })());
          if (!url) {
            if (optional) {
              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { skipped: true } });
              results.push({ stepId: sid, name, ok: true });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
              } catch { }
              continue;
            }
            results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: 'missing_url' });
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'unknown', message: 'missing_url' });
            continue;
          }
          if (!isSameSiteAllowed(s.allowedOrigin, url)) {
            if (optional) {
              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { skipped: true, reason: 'same_site_blocked' } });
              results.push({ stepId: sid, name, ok: true });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
              } catch { }
              continue;
            }
            results.push({ stepId: sid, name, ok: false, reason: 'same_site_blocked', message: url });
            broadcastBrowserEvent(sessionId, { type: 'goto_blocked', stepId: sid, ts: now(), url, reason: 'same_site_blocked', message: 'cross_site_blocked' });
            try {
              broadcastBrowserEvent(sessionId, {
                type: 'action_error',
                ts: now(),
                actionId: sid,
                actionType: name,
                reason: 'same_site_blocked',
                error: 'cross_site_blocked',
              });
            } catch { }
            continue;
          }
          broadcastBrowserEvent(sessionId, { type: 'cursor_move', ts: now(), x: 30, y: 20 });
          broadcastBrowserEvent(sessionId, { type: 'highlight_boxes', ts: now(), boxes: [{ x: 10, y: 8, width: 520, height: 38, label: 'goto' }] });

          setStreamMask(sessionId, []);
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

          // [Wakil 3.2] Port Validation Safeguard
          const { isPortOpen, isLocalOrInternalUrl } = await import('../../shared/utils/network');
          if (isLocalOrInternalUrl(url)) {
            try {
              const u = new URL(url);
              const port = parseInt(u.port) || (u.protocol === 'https:' ? 443 : 80);
              const open = await isPortOpen(u.hostname, port);
              if (!open) {
                const msg = `Navigation failed because no running web server was detected at ${u.hostname}:${port}. No URL was provided or discovered.`;
                results.push({ stepId: sid, name, ok: false, reason: 'navigation_failed', message: msg });
                broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'navigation_failed', message: msg });
                try {
                  broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason: 'navigation_failed', error: msg });
                } catch { }
                continue;
              }
            } catch { }
          }

          const navReason = (msg: string): FailureReason => {
            const m = String(msg || '').toLowerCase();
            if (/err_name_not_resolved|enotfound|dns|name not resolved/.test(m)) return 'dns_failed';
            if (/err_cert|ssl|tls|certificate|net::err/.test(m)) return 'navigation_failed';
            if (/timeout/i.test(m)) return 'timeout';
            return 'navigation_failed';
          };

          const gotoCandidates = (() => {
            const out: string[] = [];
            const push = (u: string) => {
              const v = String(u || '').trim();
              if (!v) return;
              if (!out.includes(v)) out.push(v);
            };
            push(url);
            try {
              const u = new URL(url);
              const hostNoWww = u.hostname.replace(/^www\./i, '');
              const isXeliteLike =
                (/xelite/i.test(hostNoWww) && /solution/i.test(hostNoWww)) ||
                /^xelitesolutions(?:\.(?:co|com))?$/i.test(hostNoWww);
              if (isXeliteLike) {
                u.hostname = hostNoWww.endsWith('.com') ? 'xelitesolutions.com' : 'xelitesolutions.co';
                push(u.toString());
                u.hostname = 'www.' + u.hostname.replace(/^www\./i, '');
                push(u.toString());
                u.hostname = u.hostname.replace(/xelitesolutions\.(?:co|com)/i, 'xelitesolutions.co');
                push(u.toString());
                u.hostname = u.hostname.replace(/xelitesolutions\.co/i, 'xelitesolutions.com');
                push(u.toString());
              } else {
                if (!/^www\./i.test(u.hostname) && u.hostname.includes('.')) {
                  u.hostname = `www.${u.hostname}`;
                  push(u.toString());
                }
              }
              if (u.protocol === 'https:') {
                u.protocol = 'http:';
                push(u.toString());
              }
            } catch { }
            return out.slice(0, 6);
          })();

          // Resilient navigation: one bounded second pass over transient failures,
          // HTTP verdicts recorded (never retried), readiness probed instead of a
          // fixed sleep. Candidate fallback order and result shapes preserved.
          const nav = await gotoResilient(page, gotoCandidates, { timeoutMs: cfg.navTimeoutMs });
          if (!nav.ok) {
            const baseMsg = nav.message || 'navigation_failed';
            const httpStatus = nav.attempts.find(a => a.httpStatus !== undefined)?.httpStatus;
            const msg = (httpStatus !== undefined ? baseMsg + ' [http ' + httpStatus + ']' : baseMsg).slice(0, 600);
            // navigation.ts reasons stay internal; the step keeps the shared
            // FailureReason vocabulary with HTTP detail in message + data.
            const reason = nav.reason === 'timeout' ? 'timeout' : navReason(msg);
            results.push({ stepId: sid, name, ok: false, reason, message: msg });
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason, message: msg, data: { attempts: nav.attempts } });
            try {
              broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason, error: msg });
            } catch { }
            continue;
          }

          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { url: page.url(), attempts: nav.attempts, readiness: nav.readiness } });
          results.push({ stepId: sid, name, ok: true });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'wait') {
          const ms = Math.max(0, Math.min(30000, Number(a?.ms || 0)));
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          // Wait effect evidence: a wait is the agent's settle primitive,
          // so the page is fingerprinted around the sleep. A quiet wait, a
          // DOM that settled mid-wait, an unexpected navigation, and errors
          // thrown during the wait must not share the same bare ok:true.
          // Evidence only: a quiet wait is reported, never failed.
          const waitBefore = await snapshotClickContext(page, sessionId);
          const waitStarted = now();
          await page.waitForTimeout(ms);
          const waitEffect = compareWaitEffect(waitBefore, await snapshotClickContext(page, sessionId), now() - waitStarted);
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          const waitData: any = waitEffect.elapsedMs === undefined ? {} : { elapsedMs: waitEffect.elapsedMs };
          const waitReceipt: any = { ...(waitData as any) };
          if (waitEffect.readOk) {
            waitData.navigated = waitEffect.navigated;
            waitData.domChanged = waitEffect.domChanged;
            waitData.effectObserved = waitEffect.effectObserved;
            waitReceipt.navigated = waitEffect.navigated;
            waitReceipt.domChanged = waitEffect.domChanged;
            waitReceipt.effectObserved = waitEffect.effectObserved;
          }
          if (waitEffect.runtimeErrors !== undefined) {
            waitData.runtimeErrors = waitEffect.runtimeErrors;
            waitReceipt.runtimeErrors = waitEffect.runtimeErrors;
          }
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: waitData });
          results.push({ stepId: sid, name, ok: true, ...waitReceipt });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'scroll') {
          const direction = a?.direction === 'up' ? 'up' : 'down';
          const amount = Math.max(120, Math.min(2400, Number(a?.amount || 800)));
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

          // Center mouse first to ensure we scroll the main view
          await centerMouseForScroll(page, interactions);

          const wheelDelta = direction === 'down' ? amount : -amount;
          const scrollBefore = await snapshotScrollPosition(page);
          await page.mouse.wheel(0, wheelDelta);
          await page.waitForTimeout(250);
          let scrollEffect = compareScrollEffect(scrollBefore, await snapshotScrollPosition(page));
          const atRequestedEdge = (fx: { atTop: boolean; atBottom: boolean }) => direction === 'down' ? fx.atBottom : fx.atTop;
          // One bounded re-pulse when movement was possible but nothing
          // moved: the wheel may have landed in a nested scrollable region.
          // At an edge there is nothing to repair — report the edge instead.
          let repaired = false;
          if (scrollEffect.readOk && !scrollEffect.moved && !atRequestedEdge(scrollEffect)) {
            await centerMouseForScroll(page, interactions);
            await page.mouse.wheel(0, wheelDelta);
            await page.waitForTimeout(250);
            scrollEffect = compareScrollEffect(scrollBefore, await snapshotScrollPosition(page));
            repaired = true;
          }
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          // Evidence only: an unmoved scroll is reported, never failed —
          // sitting at an edge is routine, and the planner decides from
          // moved/atEdge. Unreadable pages leave the fields absent.
          const scrollData: any = { repaired };
          const scrollReceipt: any = { repaired };
          if (scrollEffect.readOk) {
            scrollData.scrolled = scrollEffect.moved;
            scrollData.scrollDeltaY = scrollEffect.deltaY;
            scrollData.atEdge = atRequestedEdge(scrollEffect);
            scrollReceipt.scrolled = scrollEffect.moved;
            scrollReceipt.scrollDeltaY = scrollEffect.deltaY;
            scrollReceipt.atEdge = atRequestedEdge(scrollEffect);
          }
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: scrollData });
          results.push({ stepId: sid, name, ok: true, ...scrollReceipt });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'hover') {
          // Hover effect evidence: a revealed menu/tooltip changes the DOM
          // while a hover over static content changes nothing. The page
          // fingerprint is element-independent, so it is captured whether
          // or not the target resolves. Evidence only, never a new failure.
          const hoverBefore = await snapshotClickContext(page, sessionId);
          const loc = locatorForAction(page, a);
          if (loc && (await loc.count().catch(() => 0)) > 0) {
            const b = await boxFor(loc);
            if (b) {
              const cx = Math.round(b.x + b.width / 2);
              const cy = Math.round(b.y + b.height / 2);
              broadcastBrowserEvent(sessionId, { type: 'cursor_move', ts: now(), x: cx, y: cy });
              broadcastBrowserEvent(sessionId, { type: 'highlight_boxes', ts: now(), boxes: [{ ...b, label: 'hover' }] });
              await interactions.hover(page, 'hover', cx, cy, 300);
            }
            // Base hover already done via interactions.hover above
          }
          await page.waitForTimeout(500);
          const hoverAfter = await snapshotClickContext(page, sessionId);
          const hoverEffect = compareClickEffect(hoverBefore, hoverAfter);
          const hoverNavigated: boolean | undefined = hoverEffect.readOk ? hoverEffect.navigated : undefined;
          const hoverDomChanged: boolean | undefined = hoverEffect.readOk ? hoverEffect.domChanged : undefined;
          const hoverEffectObserved: boolean | undefined = hoverEffect.readOk ? hoverEffect.effectObserved : undefined;
          const hoverRuntimeErrors: number | undefined = hoverEffect.runtimeErrors;
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          const hoverData = hoverEffectObserved === undefined && hoverRuntimeErrors === undefined
            ? undefined
            : { navigated: hoverNavigated, domChanged: hoverDomChanged, effectObserved: hoverEffectObserved, runtimeErrors: hoverRuntimeErrors };
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: hoverData });
          results.push({ stepId: sid, name, ok: true, navigated: hoverNavigated, domChanged: hoverDomChanged, effectObserved: hoverEffectObserved, runtimeErrors: hoverRuntimeErrors });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'ui_audit') {
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { ok: true } });
          results.push({ stepId: sid, name, ok: true });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'assert') {
          // Assert observed state: wait as before, then read what the page
          // actually showed (matched/visible counts). Success carries the
          // counts; failure names the observed state with the reason that
          // cures it. Fail-fast run semantics are unchanged — a failed
          // assert still stops the run; it just says what it saw first.
          const target = parseAssertTarget(a);
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          if (target.kind === 'missing') {
            const missingMsg = 'assert_missing_target: provide selector or text';
            results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: missingMsg });
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'unknown', message: missingMsg });
            try {
              broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason: 'unknown', error: missingMsg });
            } catch { }
            setStreamMask(sessionId, []);
            break;
          }
          const query = target.kind === 'selector' ? page.locator(target.value) : page.getByText(target.value, { exact: false });
          const observeAssert = (): Promise<AssertObservation> => observeAssertState({
            count: () => query.count(),
            isVisibleAt: (i: number) => query.nth(i).isVisible(),
          });
          const recordInvalidSelector = () => {
            const syntaxMsg = `invalid_selector: ${target.kind} ${JSON.stringify(target.value.slice(0, 120))} could not be parsed`;
            results.push({ stepId: sid, name, ok: false, reason: 'invalid_selector', message: syntaxMsg });
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'invalid_selector', message: syntaxMsg });
            try {
              broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason: 'invalid_selector', error: syntaxMsg });
            } catch { }
            setStreamMask(sessionId, []);
          };
          try {
            await query.first().waitFor({ state: 'visible', timeout: cfg.actionTimeoutMs });
          } catch (waitErr: any) {
            if (isSelectorSyntaxError(waitErr)) {
              recordInvalidSelector();
              break;
            }
            let failureObs: AssertObservation | null = null;
            try {
              failureObs = await observeAssert();
            } catch (obsErr: any) {
              if (isSelectorSyntaxError(obsErr)) {
                recordInvalidSelector();
                break;
              }
              throw waitErr;
            }
            const verdict = evaluateAssertObservation(failureObs);
            const afterFail = await screenshotJpegBase64(page);
            evidence.push({ kind: 'screenshot', jpegBase64: afterFail, ts: now(), stepId: sid });
            results.push({ stepId: sid, name, ok: false, reason: verdict.reason, message: verdict.detail, matched: failureObs.matched, visibleCount: failureObs.visible });
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: verdict.reason, message: verdict.detail });
            try {
              broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason: verdict.reason, error: verdict.detail });
            } catch { }
            setStreamMask(sessionId, []);
            break;
          }
          let successObs: AssertObservation | null = null;
          try {
            successObs = await observeAssert();
          } catch {
            successObs = null;
          }
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          const assertData = successObs ? { matched: successObs.matched, visibleCount: successObs.visible } : undefined;
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: assertData });
          results.push({ stepId: sid, name, ok: true, matched: successObs?.matched, visibleCount: successObs?.visible });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'key') {
          const key = String(a?.key || '');
          if (key) {
            // Key effect evidence: the fingerprint names navigation/DOM
            // change, the focus descriptor names Tab-order moves and typed
            // text. Evidence only — a swallowed keypress is reported,
            // never failed.
            const keyBefore: KeyContext = {
              page: await snapshotClickContext(page, sessionId),
              focus: await snapshotKeyFocus(page),
            };
            await page.keyboard.press(key);
            await page.waitForTimeout(100);
            const keyAfter: KeyContext = {
              page: await snapshotClickContext(page, sessionId),
              focus: await snapshotKeyFocus(page),
            };
            const keyEffect = compareKeyEffect(keyBefore, keyAfter);
            const keyNavigated: boolean | undefined = keyEffect.readOk ? keyEffect.navigated : undefined;
            const keyDomChanged: boolean | undefined = keyEffect.readOk ? keyEffect.domChanged : undefined;
            const keyFocusChanged: boolean | undefined = keyEffect.focusReadOk ? keyEffect.focusChanged : undefined;
            const keyEffectObserved: boolean | undefined = (keyEffect.readOk || keyEffect.focusReadOk) ? keyEffect.effectObserved : undefined;
            const keyRuntimeErrors: number | undefined = keyEffect.runtimeErrors;
            const after = await screenshotJpegBase64(page);
            evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
            const keyData = keyEffectObserved === undefined && keyRuntimeErrors === undefined
              ? undefined
              : { navigated: keyNavigated, domChanged: keyDomChanged, focusChanged: keyFocusChanged, effectObserved: keyEffectObserved, runtimeErrors: keyRuntimeErrors };
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: keyData });
            results.push({ stepId: sid, name, ok: true, navigated: keyNavigated, domChanged: keyDomChanged, focusChanged: keyFocusChanged, effectObserved: keyEffectObserved, runtimeErrors: keyRuntimeErrors });
            try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
            continue;
          }
        }

        if (name === 'evaluate') {
          const script = String(a?.script || '');
          if (script) {
            // Evaluate effect evidence: an arbitrary script can do
            // anything, so the receipt names what it returned (a bounded
            // summary) plus the observed page effect around it. Evidence
            // only — a thrown script still fails its step through the
            // outer catch, and an empty script keeps its fall-through.
            const evalBefore = await snapshotClickContext(page, sessionId);
            const res = await page.evaluate(script);
            const summary = summarizeEvaluateResult(res);
            await page.waitForTimeout(250);
            const evalEffect = compareClickEffect(evalBefore, await snapshotClickContext(page, sessionId));
            const evalNavigated: boolean | undefined = evalEffect.readOk ? evalEffect.navigated : undefined;
            const evalDomChanged: boolean | undefined = evalEffect.readOk ? evalEffect.domChanged : undefined;
            const evalEffectObserved: boolean | undefined = evalEffect.readOk ? evalEffect.effectObserved : undefined;
            const evalRuntimeErrors: number | undefined = evalEffect.runtimeErrors;
            const evalData = { result: summary.resultPreview, resultType: summary.resultType, resultLength: summary.resultLength, navigated: evalNavigated, domChanged: evalDomChanged, effectObserved: evalEffectObserved, runtimeErrors: evalRuntimeErrors };
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: evalData });
            results.push({ stepId: sid, name, ok: true, message: summary.resultPreview, resultType: summary.resultType, resultLength: summary.resultLength, navigated: evalNavigated, domChanged: evalDomChanged, effectObserved: evalEffectObserved, runtimeErrors: evalRuntimeErrors });
            try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
            continue;
          }
        }

        if (name === 'click' || name === 'type' || name === 'fill') {
          if (name === 'click') {
            const xNum = Number(a?.x);
            const yNum = Number(a?.y);
            if (Number.isFinite(xNum) && Number.isFinite(yNum)) {
              const x = Math.max(0, Math.round(xNum));
              const y = Math.max(0, Math.round(yNum));
              try {
                broadcastBrowserEvent(sessionId, { type: 'cursor_move', ts: now(), x, y });
                broadcastBrowserEvent(sessionId, {
                  type: 'highlight_boxes',
                  ts: now(),
                  boxes: [{ x: Math.max(0, x - 6), y: Math.max(0, y - 6), width: 12, height: 12, label: 'click' }],
                });
              } catch { }

              setStreamMask(sessionId, []);
              const before = await screenshotJpegBase64(page);
              evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

              // Coordinate-click parity: the `click` spelling with x/y carries
              // the same snapshot/compare receipt as `click_coordinates`, so a
              // dead-region poke and a working control never share the same
              // bare ok:true. Settle matches the proven 250ms. Evidence only.
              const coordClickBefore = await snapshotClickContext(page, sessionId);
              await interactions.naturalClick(page, 'click', x, y);

              await page.waitForTimeout(250);
              const coordClickAfter = await snapshotClickContext(page, sessionId);
              const coordClickEffect = compareClickEffect(coordClickBefore, coordClickAfter);
              const coordClickNavigated: boolean | undefined = coordClickEffect.readOk ? coordClickEffect.navigated : undefined;
              const coordClickDomChanged: boolean | undefined = coordClickEffect.readOk ? coordClickEffect.domChanged : undefined;
              const coordClickEffectObserved: boolean | undefined = coordClickEffect.readOk ? coordClickEffect.effectObserved : undefined;
              const coordClickRuntimeErrors: number | undefined = coordClickEffect.runtimeErrors;
              const after = await screenshotJpegBase64(page);
              evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

              const coordClickEffectData = coordClickEffectObserved === undefined && coordClickRuntimeErrors === undefined
                ? undefined
                : { navigated: coordClickNavigated, domChanged: coordClickDomChanged, effectObserved: coordClickEffectObserved, runtimeErrors: coordClickRuntimeErrors };
              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: coordClickEffectData });
              results.push({ stepId: sid, name, ok: true, navigated: coordClickNavigated, domChanged: coordClickDomChanged, effectObserved: coordClickEffectObserved, runtimeErrors: coordClickRuntimeErrors });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
              } catch { }
              continue;
            }
          }

          // Global type/fill (interactive mode, no selector/coords)
          if ((name === 'type' || name === 'fill') && !a?.selector && !a?.role && !a?.name && !a?.textTarget && (!Number.isFinite(Number(a?.x)) || !Number.isFinite(Number(a?.y)))) {
            const text = String(a?.text || '');
            setStreamMask(sessionId, []);
            const before = await screenshotJpegBase64(page);
            evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

            if (text === '\n') await page.keyboard.press('Enter');
            else if (text === '\t') await page.keyboard.press('Tab');
            else if (text === '\b') await page.keyboard.press('Backspace');
            else if (text === '\x7f') await page.keyboard.press('Delete');
            else await interactions.naturalType(page, 'global_type', text);

            await page.waitForTimeout(50);
            const after = await screenshotJpegBase64(page);
            evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
            results.push({ stepId: sid, name, ok: true });
            try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
            continue;
          }

          if (name === 'type' || name === 'fill') {
            const xNum = Number(a?.x);
            const yNum = Number(a?.y);
            if (Number.isFinite(xNum) && Number.isFinite(yNum) && !a?.selector && !a?.role && !a?.name && !a?.textTarget) {
              const x = Math.max(0, Math.round(xNum));
              const y = Math.max(0, Math.round(yNum));
              const raw = String(a?.text || '');
              const secretMatch = raw.match(SECRET_TOKEN_RE);
              const secretKey = secretMatch ? String(secretMatch[1] || '').trim() : '';
              const secretIsPassword = secretKey ? /(?:^|_)PASSWORD(?:$|_)/i.test(secretKey) : false;
              if (!secretIsPassword) {
                let textToType = raw;
                if (secretMatch) {
                  const secretValue =
                    (secretKey ? getSessionSecret(sessionId, secretKey) : null) ||
                    (secretKey ? await getUserSecret(userId, 'internal', secretKey) : null) ||
                    '';
                  if (!secretValue) {
                    results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: `missing_secret:${secretKey}` });
                    broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'unknown', message: `missing_secret:${secretKey}` });
                    // ASK for it. The prompt exists in the UI and was never
                    // reached: the run only ever reported the error.
                    try {
                      const { broadcastSecretRequired } = require('../../api/ws');
                      broadcastSecretRequired(sessionId, String(secretKey), {
                        label: String(secretKey),
                        reason: `الخطوة «${name}» تحتاج هذه البيانات للمتابعة.`,
                      });
                    } catch { /* the UI is optional; the error above still stands */ }
                    try {
                      broadcastBrowserEvent(sessionId, {
                        type: 'action_error',
                        ts: now(),
                        actionId: sid,
                        actionType: name,
                        reason: 'unknown',
                        error: `missing_secret:${secretKey}`,
                      });
                    } catch { }
                    continue;
                  }
                  textToType = secretValue;
                }

                try {
                  broadcastBrowserEvent(sessionId, { type: 'cursor_move', ts: now(), x, y });
                  broadcastBrowserEvent(sessionId, {
                    type: 'highlight_boxes',
                    ts: now(),
                    boxes: [{ x: Math.max(0, x - 6), y: Math.max(0, y - 6), width: 12, height: 12, label: 'type' }],
                  });
                } catch { }

                setStreamMask(sessionId, []);
                const before = await screenshotJpegBase64(page);
                evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

                await interactions.naturalClick(page, 'type_click', x, y);
                try {
                  await page.keyboard.press('Meta+A');
                } catch {
                  try {
                    await page.keyboard.press('Control+A');
                  } catch { }
                }
                try {
                  await page.keyboard.press('Backspace');
                } catch { }
                await interactions.naturalType(page, 'type_secret', textToType);

                await page.waitForTimeout(120);
                const after = await screenshotJpegBase64(page);
                evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

                broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
                results.push({ stepId: sid, name, ok: true });
                try {
                  broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
                } catch { }
                continue;
              }
            }

            const textRaw = String(a?.text || '');
            if (textRaw && !a?.selector && !a?.role && !a?.name && !a?.textTarget) {
              const secretMatch = textRaw.match(SECRET_TOKEN_RE);
              if (secretMatch) {
                const secretKey = String(secretMatch[1] || '').trim();
                const secretValue =
                  (secretKey ? getSessionSecret(sessionId, secretKey) : null) ||
                  (secretKey ? await getUserSecret(userId, 'internal', secretKey) : null) ||
                  '';
                if (!secretValue) {
                  results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: `missing_secret:${secretKey}` });
                  broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'unknown', message: `missing_secret:${secretKey}` });
                  try {
                    const { broadcastSecretRequired } = require('../../api/ws');
                    broadcastSecretRequired(sessionId, String(secretKey), { label: String(secretKey) });
                  } catch { /* the UI is optional */ }
                  try {
                    broadcastBrowserEvent(sessionId, {
                      type: 'action_error',
                      ts: now(),
                      actionId: sid,
                      actionType: name,
                      reason: 'unknown',
                      error: `missing_secret:${secretKey}`,
                    });
                  } catch { }
                  continue;
                }

                const optional = Boolean(a?.optional);
                const kind =
                  /(?:^|_)EMAIL(?:$|_)/i.test(secretKey) ? ('email' as const) : /(?:^|_)PASSWORD(?:$|_)/i.test(secretKey) ? ('password' as const) : null;
                const fieldLoc = kind ? await findCredentialField(page, kind) : null;
                const count = fieldLoc ? await fieldLoc.count().catch(() => 0) : 0;
                if (!fieldLoc || !count) {
                  if (optional) {
                    broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { skipped: true } });
                    results.push({ stepId: sid, name, ok: true });
                    try {
                      broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
                    } catch { }
                    continue;
                  }
                  results.push({ stepId: sid, name, ok: false, reason: 'element_not_found', message: 'no_locator' });
                  broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'element_not_found', message: 'no_locator' });
                  try {
                    broadcastBrowserEvent(sessionId, {
                      type: 'action_error',
                      ts: now(),
                      actionId: sid,
                      actionType: name,
                      reason: 'element_not_found',
                      error: 'no_locator',
                    });
                  } catch { }
                  continue;
                }

                const isSensitive = kind === 'password';
                if (isSensitive) {
                  mask = [fieldLoc.first()];
                  setStreamMask(sessionId, mask);
                } else {
                  setStreamMask(sessionId, []);
                }
                const b = await boxFor(fieldLoc);
                if (b) {
                  const cx = Math.round(b.x + b.width / 2);
                  const cy = Math.round(b.y + b.height / 2);
                  try {
                    broadcastBrowserEvent(sessionId, { type: 'cursor_move', ts: now(), x: cx, y: cy });
                    broadcastBrowserEvent(sessionId, { type: 'highlight_boxes', ts: now(), boxes: [{ ...b, label: 'type' }] });
                  } catch { }
                }
                const before = await screenshotJpegBase64(page, isSensitive ? mask : undefined);
                evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
                await fieldLoc.first().click({ timeout: cfg.actionTimeoutMs });
                await fieldLoc.first().fill(secretValue, { timeout: cfg.actionTimeoutMs });
                const after = await screenshotJpegBase64(page, isSensitive ? mask : undefined);
                evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
                if (isSensitive) setStreamMask(sessionId, []);
                broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
                results.push({ stepId: sid, name, ok: true });
                try {
                  broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
                } catch { }
                continue;
              } else {
                setStreamMask(sessionId, []);
                const before = await screenshotJpegBase64(page);
                evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

                await interactions.naturalType(page, 'type_text', textRaw);

                await page.waitForTimeout(80);
                const after = await screenshotJpegBase64(page);
                evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

                broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
                results.push({ stepId: sid, name, ok: true });
                try {
                  broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
                } catch { }
                continue;
              }
            }
          }

          const optional = Boolean(a?.optional);
          const loc = locatorForAction(page, a);
          if (!loc) {
            if (optional) {
              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { skipped: true } });
              results.push({ stepId: sid, name, ok: true });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
              } catch { }
              continue;
            }
            results.push({ stepId: sid, name, ok: false, reason: 'element_not_found', message: 'no_locator' });
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'element_not_found', message: 'no_locator' });
            try {
              broadcastBrowserEvent(sessionId, {
                type: 'action_error',
                ts: now(),
                actionId: sid,
                actionType: name,
                reason: 'element_not_found',
                error: 'no_locator',
              });
            } catch { }
            continue;
          }

          const count = await loc.count().catch(() => 0);
          if (!count) {
            if (optional) {
              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { skipped: true, reason: 'element_not_found' } });
              results.push({ stepId: sid, name, ok: true });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
              } catch { }
              continue;
            }
            results.push({ stepId: sid, name, ok: false, reason: 'element_not_found', message: 'not_found' });
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'element_not_found', message: 'not_found' });
            try {
              broadcastBrowserEvent(sessionId, {
                type: 'action_error',
                ts: now(),
                actionId: sid,
                actionType: name,
                reason: 'element_not_found',
                error: 'not_found',
              });
            } catch { }
            continue;
          }

          const b = await boxFor(loc);
          let targetCenter: { x: number; y: number } | null = null;
          if (b) {
            const cx = Math.round(b.x + b.width / 2);
            const cy = Math.round(b.y + b.height / 2);
            targetCenter = { x: cx, y: cy };
            broadcastBrowserEvent(sessionId, { type: 'highlight_boxes', ts: now(), boxes: [{ ...b, label: name }] });
            try {
              const startX = interactions.getMouseInfo().position.x;
              const startY = interactions.getMouseInfo().position.y;
              await interactions.naturalMouseMove(page, startX, startY, cx, cy, 300);
            } catch { }
          }

          const textRaw = typeActionText(name, a);
          const secretMatch = (name === 'type' || name === 'fill') ? textRaw.match(SECRET_TOKEN_RE) : null;
          if (secretMatch) {
            const secretKey = String(secretMatch[1] || '').trim();
            const secretValue =
              getSessionSecret(sessionId, secretKey) ||
              (await getUserSecret(userId, 'internal', secretKey)) ||
              '';
            if (!secretValue) {
              results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: `missing_secret:${secretKey}` });
              broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'unknown', message: `missing_secret:${secretKey}` });
              try {
                broadcastBrowserEvent(sessionId, {
                  type: 'action_error',
                  ts: now(),
                  actionId: sid,
                  actionType: name,
                  reason: 'unknown',
                  error: `missing_secret:${secretKey}`,
                });
              } catch { }
              continue;
            }
            mask = [loc.first()];
            setStreamMask(sessionId, mask);
            const before = await screenshotJpegBase64(page, mask);
            evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
            if (targetCenter) {
              await interactions.naturalClick(page, 'secret_click', targetCenter.x, targetCenter.y);
              await interactions.naturalType(page, 'secret_type', secretValue);
            } else {
              await loc.first().click({ timeout: cfg.actionTimeoutMs });
              await loc.first().fill(secretValue, { timeout: cfg.actionTimeoutMs });
            }
            const after = await screenshotJpegBase64(page, mask);
            evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
            setStreamMask(sessionId, []);
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
            results.push({ stepId: sid, name, ok: true });
            try {
              broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
            } catch { }
            continue;
          }

          const isSensitiveType =
            (name === 'type' || name === 'fill') &&
            (typeof a?.selector === 'string'
              ? /type\s*=\s*["']password["']|password|current-password/i.test(String(a.selector))
              : typeof a?.name === 'string'
                ? /password|كلمة المرور/i.test(String(a.name))
                : false);
          if (isSensitiveType) {
            mask = [loc.first()];
            setStreamMask(sessionId, mask);
          } else {
            setStreamMask(sessionId, []);
          }
          const before = await screenshotJpegBase64(page, isSensitiveType ? mask : undefined);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

          // Click effect evidence: snapshot the page before acting; the
          // after-snapshot lands after the settle wait below. Clicks only —
          // type/fill carry their own read-back verification.
          const clickBefore: ClickContext | null = name === 'click' ? await snapshotClickContext(page, sessionId) : null;
          let navigated: boolean | undefined = undefined;
          let domChanged: boolean | undefined = undefined;
          let effectObserved: boolean | undefined = undefined;
          let runtimeErrors: number | undefined = undefined;

          try {
            if (name === 'click') {
              if (targetCenter) {
                await interactions.naturalClick(page, 'selector_click', targetCenter.x, targetCenter.y);
              } else {
                await loc.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
                await loc.first().click({ timeout: cfg.actionTimeoutMs });
              }
            } else {
              if (targetCenter) {
                await interactions.naturalClick(page, 'type_click', targetCenter.x, targetCenter.y);
                await interactions.naturalType(page, 'type_text', textRaw);
              } else {
                await loc.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
                await loc.first().click({ timeout: cfg.actionTimeoutMs });
                await loc.first().fill(textRaw, { timeout: cfg.actionTimeoutMs });
              }
            }
          } catch (e: any) {
            await tryDismissOverlays(page);
            try {
              if (name === 'click') {
                if (targetCenter) await interactions.naturalClick(page, 'selector_click_retry', targetCenter.x, targetCenter.y);
                else {
                  await loc.first().scrollIntoViewIfNeeded().catch(() => { });
                  await loc.first().click({ timeout: cfg.actionTimeoutMs, force: true });
                }
              } else {
                if (targetCenter) {
                  await interactions.naturalClick(page, 'type_click_retry', targetCenter.x, targetCenter.y);
                  await interactions.naturalType(page, 'type_text_retry', textRaw);
                } else {
                  await loc.first().scrollIntoViewIfNeeded().catch(() => { });
                  await loc.first().click({ timeout: cfg.actionTimeoutMs, force: true });
                  await loc.first().fill(textRaw, { timeout: cfg.actionTimeoutMs });
                }
              }
            } catch (e2: any) {
              const msg = String(e2?.message || e2);
              const reason: FailureReason = classifyActionError(e2);
              broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason, message: msg });
              results.push({ stepId: sid, name, ok: false, reason, message: msg });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason, error: msg });
              } catch { }
              if (isSensitiveType) setStreamMask(sessionId, []);
              continue;
            }
          }
          // Effect evidence for type/fill: read the field back; on mismatch
          // make exactly one bounded repair, then report what was observed.
          // Only booleans and lengths are recorded -- never the values.
          let verified: boolean | undefined = undefined;
          let valueMatch: boolean | undefined = undefined;
          let repaired = false;
          if (name === 'type' || name === 'fill') {
            try {
              const check = await ensureTypedValue(
                targetCenter
                  ? {
                    read: () => loc.first().inputValue(),
                    clearAndSet: async (text: string) => {
                      try {
                        await page.keyboard.press('Meta+A');
                      } catch {
                        try {
                          await page.keyboard.press('Control+A');
                        } catch { }
                      }
                      try {
                        await page.keyboard.press('Backspace');
                      } catch { }
                      await interactions.naturalType(page, 'type_text_repair', text);
                    },
                  }
                  : {
                    read: () => loc.first().inputValue(),
                    clearAndSet: (text: string) => loc.first().fill(text, { timeout: cfg.actionTimeoutMs }),
                  },
                textRaw,
              );
              if (!check.readOk) {
                verified = false;
              } else {
                verified = true;
                valueMatch = check.match;
                repaired = check.repaired;
                if (!check.match) {
                  const detail = `value_mismatch expected_len=${check.expectedLength} observed_len=${check.observedLength}${check.repaired ? ' repaired_once' : ''}`;
                  broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'value_not_applied', message: detail });
                  results.push({ stepId: sid, name, ok: false, reason: 'value_not_applied', message: detail, verified, valueMatch, repaired });
                  try {
                    broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason: 'value_not_applied', error: detail });
                  } catch { }
                  if (isSensitiveType) setStreamMask(sessionId, []);
                  continue;
                }
              }
            } catch (e3: any) {
              const msg3 = String(e3?.message || e3);
              const reason3: FailureReason = classifyActionError(e3);
              broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: reason3, message: msg3 });
              results.push({ stepId: sid, name, ok: false, reason: reason3, message: msg3, verified: false });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason: reason3, error: msg3 });
              } catch { }
              if (isSensitiveType) setStreamMask(sessionId, []);
              continue;
            }
          }

          await page.waitForTimeout(250);
          const after = await screenshotJpegBase64(page, isSensitiveType ? mask : undefined);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          if (isSensitiveType) setStreamMask(sessionId, []);

          // Click effect evidence: compare the after-settle page against the
          // before-snapshot. Evidence only — a no-effect click is reported,
          // never failed.
          if (name === 'click' && clickBefore) {
            const clickAfter = await snapshotClickContext(page, sessionId);
            const effect = compareClickEffect(clickBefore, clickAfter);
            if (effect.readOk) {
              navigated = effect.navigated;
              domChanged = effect.domChanged;
              effectObserved = effect.effectObserved;
            }
            runtimeErrors = effect.runtimeErrors;
          }

          if (cfg.strictSameSite && s.allowedOrigin) {
            const cur = page.url();
            try {
              const u = new URL(cur);
              if (u.origin !== s.allowedOrigin) {
                broadcastBrowserEvent(sessionId, { type: 'goto_blocked', stepId: sid, ts: now(), url: cur, reason: 'same_site_blocked', message: 'cross_site_blocked' });
                try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs }); } catch { }
                results.push({ stepId: sid, name, ok: false, reason: 'same_site_blocked', message: cur });
                try {
                  broadcastBrowserEvent(sessionId, {
                    type: 'action_error',
                    ts: now(),
                    actionId: sid,
                    actionType: name,
                    reason: 'same_site_blocked',
                    error: 'cross_site_blocked',
                  });
                } catch { }
                continue;
              }
            } catch { }
          }

          const clickEffectData = effectObserved === undefined && runtimeErrors === undefined ? {} : { navigated, domChanged, effectObserved, runtimeErrors };
          const stepData = { ...(verified === undefined ? {} : { verified, valueMatch, repaired }), ...clickEffectData };
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: Object.keys(stepData).length ? stepData : undefined });
          results.push({ stepId: sid, name, ok: true, verified, valueMatch, repaired, navigated, domChanged, effectObserved, runtimeErrors });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'back') {
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          // Traversal effect evidence: an empty-history back is a provable
          // no-op, a real one loads a new document. Evidence only — a
          // no-op traversal is reported, never failed.
          const observed = await observeTraversalStep(page, sessionId, () =>
            page.goBack({ waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs }));
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { navigated: observed.navigated, domChanged: observed.domChanged, documentChanged: observed.documentChanged, effectObserved: observed.effectObserved, navigationError: observed.navigationError, runtimeErrors: observed.runtimeErrors, readiness: observed.readiness } });
          results.push({ stepId: sid, name, ok: true, navigated: observed.navigated, domChanged: observed.domChanged, documentChanged: observed.documentChanged, effectObserved: observed.effectObserved, navigationError: observed.navigationError, runtimeErrors: observed.runtimeErrors });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'forward') {
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          // Traversal effect evidence: same contract as back — observed
          // page state names the effect, evidence only, never failed.
          const observed = await observeTraversalStep(page, sessionId, () =>
            page.goForward({ waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs }));
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { navigated: observed.navigated, domChanged: observed.domChanged, documentChanged: observed.documentChanged, effectObserved: observed.effectObserved, navigationError: observed.navigationError, runtimeErrors: observed.runtimeErrors, readiness: observed.readiness } });
          results.push({ stepId: sid, name, ok: true, navigated: observed.navigated, domChanged: observed.domChanged, documentChanged: observed.documentChanged, effectObserved: observed.effectObserved, navigationError: observed.navigationError, runtimeErrors: observed.runtimeErrors });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'reload') {
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          // Traversal effect evidence: a reload keeps the URL, so only the
          // document identity can prove it happened. Evidence only.
          const observed = await observeTraversalStep(page, sessionId, () =>
            page.reload({ waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs }));
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { navigated: observed.navigated, domChanged: observed.domChanged, documentChanged: observed.documentChanged, effectObserved: observed.effectObserved, navigationError: observed.navigationError, runtimeErrors: observed.runtimeErrors, readiness: observed.readiness } });
          results.push({ stepId: sid, name, ok: true, navigated: observed.navigated, domChanged: observed.domChanged, documentChanged: observed.documentChanged, effectObserved: observed.effectObserved, navigationError: observed.navigationError, runtimeErrors: observed.runtimeErrors });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'screenshot') {
          const current = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: current, ts: now(), stepId: sid });
          const cap = captureEvidence(current);
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { captured: cap.captured, captureBytes: cap.captureBytes } });
          results.push({ stepId: sid, name, ok: true, captured: cap.captured, captureBytes: cap.captureBytes });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'extract_text') {
          // Observation receipt: a selector miss fails its step with the
          // reason that cures it (not ok:true with "Element not found" as
          // the text), an invalid selector fails its step instead of the
          // run, and a hit carries found + length. The run continues past
          // a failed extract — the goto/scroll_to_element precedent for a
          // step-scoped failure — while the final report still fails.
          const selector = String(a?.selector || '').trim();
          if (selector) {
            const read: any = await page.evaluate(buildExtractReadEval(selector));
            const verdict = evaluateExtractObservation(read, selector);
            if (!verdict.ok) {
              broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: verdict.reason, message: verdict.detail });
              results.push({ stepId: sid, name, ok: false, reason: verdict.reason, message: verdict.detail, found: false });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason: verdict.reason, error: verdict.detail });
              } catch { }
              continue;
            }
            if (!verdict.verified) {
              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { verified: false } });
              results.push({ stepId: sid, name, ok: true, verified: false });
              try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
              continue;
            }
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { text: verdict.text } });
            results.push({ stepId: sid, name, ok: true, message: verdict.text.slice(0, 200), found: true, textLength: verdict.textLength });
            try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
            continue;
          }
          const bodyText: string = await page.evaluate(() => (document.body.innerText || '').substring(0, 10000));
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { text: bodyText } });
          results.push({ stepId: sid, name, ok: true, message: bodyText.slice(0, 200), textLength: bodyText.length });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'get_elements') {
          const obs: any = await page.evaluate(ELEMENTS_READ_SCRIPT);
          const elements = Array.isArray(obs?.elements) ? obs.elements : [];
          const verdict = evaluateElementsObservation({ total: obs?.total, returned: elements.length });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { elements, totalMatched: verdict.totalMatched, truncated: verdict.truncated } });
          results.push({ stepId: sid, name, ok: true, elementCount: verdict.elementCount, totalMatched: verdict.totalMatched, truncated: verdict.truncated });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'scroll_to_element') {
          const selector = String(a?.selector || '').trim();
          if (!selector) {
            results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: 'missing_selector' });
            continue;
          }
          try {
            const targetReadEval = buildScrollTargetReadEval(selector);
            const readTargetState = async (): Promise<{ found: boolean; inViewport: boolean; invalid: boolean } | null> => {
              try {
                const cur: any = await page.evaluate(targetReadEval);
                if (!cur || typeof cur.found !== 'boolean') return null;
                return { found: cur.found === true, inViewport: cur.inViewport === true, invalid: cur.invalid === true };
              } catch {
                return null;
              }
            };
            const failScrollTarget = (reason: FailureReason, message: string, wasRepaired: boolean) => {
              broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason, message });
              results.push({ stepId: sid, name, ok: false, reason, message, inViewport: false, repaired: wasRepaired });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason, error: message });
              } catch { }
            };
            const succeedScrollTarget = (wasRepaired: boolean) => {
              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { inViewport: true, repaired: wasRepaired } });
              results.push({ stepId: sid, name, ok: true, inViewport: true, repaired: wasRepaired });
              try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
            };
            let targetState = await readTargetState();
            if (targetState && targetState.invalid) {
              failScrollTarget('unknown', 'scroll_invalid_selector', false);
              continue;
            }
            if (targetState && !targetState.found) {
              failScrollTarget('element_not_found', 'scroll_target_not_found', false);
              continue;
            }
            if (targetState && targetState.inViewport) {
              // Already in view: no scroll needed, and recentering would only move it.
              succeedScrollTarget(false);
              continue;
            }
            // Found-but-outside, or an unreadable page: attempt the scroll,
            // then read again. One bounded instant re-scroll on a
            // still-outside target. Only booleans are recorded — never content.
            let repaired = false;
            try {
              await page.evaluate(buildScrollIntoViewEval(selector, false));
              await page.waitForTimeout(500);
            } catch { /* fall through: the re-read below reports the truth */ }
            targetState = await readTargetState();
            if (targetState && targetState.found && !targetState.inViewport) {
              try {
                await page.evaluate(buildScrollIntoViewEval(selector, true));
                await page.waitForTimeout(300);
              } catch { /* the re-read below reports the truth */ }
              targetState = await readTargetState();
              repaired = true;
            }
            if (!targetState) {
              // Unreadable page: keep the action's own verdict, marked unverified.
              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { verified: false } });
              results.push({ stepId: sid, name, ok: true, verified: false });
              try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
              continue;
            }
            if (!targetState.found) {
              failScrollTarget('element_not_found', 'scroll_target_not_found', repaired);
              continue;
            }
            if (!targetState.inViewport) {
              // Twice-observed outside the viewport: positive evidence of failure.
              failScrollTarget('scroll_target_not_visible', 'scroll_target_not_visible', repaired);
              continue;
            }
            succeedScrollTarget(repaired);
            continue;
          } catch (e: any) {
            // Contained per-action: a bad scroll target fails its step, not the run.
            const msg = String(e?.message || e);
            const reason: FailureReason = classifyActionError(e);
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason, message: msg });
            results.push({ stepId: sid, name, ok: false, reason, message: msg });
            try {
              broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason, error: msg });
            } catch { }
            continue;
          }
        }

        if (name === 'click_coordinates') {
          const x = Number(a?.x);
          const y = Number(a?.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            // Coordinate clicks reuse the click snapshot machinery: a
            // dead-region poke and a working control must not share the
            // same bare ok:true. Evidence only, never a new failure.
            const coordBefore = await snapshotClickContext(page, sessionId);
            await interactions.naturalClick(page, 'coord_click', x, y);
            await page.waitForTimeout(250);
            const coordAfter = await snapshotClickContext(page, sessionId);
            const effect = compareClickEffect(coordBefore, coordAfter);
            let navigated: boolean | undefined = undefined;
            let domChanged: boolean | undefined = undefined;
            let effectObserved: boolean | undefined = undefined;
            if (effect.readOk) {
              navigated = effect.navigated;
              domChanged = effect.domChanged;
              effectObserved = effect.effectObserved;
            }
            const runtimeErrors: number | undefined = effect.runtimeErrors;
            const effectData = effectObserved === undefined && runtimeErrors === undefined
              ? undefined
              : { navigated, domChanged, effectObserved, runtimeErrors };
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: effectData });
            results.push({ stepId: sid, name, ok: true, navigated, domChanged, effectObserved, runtimeErrors });
            try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
            continue;
          } else {
            results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: 'invalid_coordinates' });
            continue;
          }
        }

        if (name === 'select') {
          const x = Number(a?.x);
          const y = Number(a?.y);
          const value = String(a?.value ?? a?.text ?? '').trim();
          if (!Number.isFinite(x) || !Number.isFinite(y) || !value) {
            results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: 'invalid_select' });
            continue;
          }
          try {
            const setEval = buildSelectSetEval(x, y, value);
            const applied: any = await page.evaluate(setEval);
            const resolved: string | null = applied && typeof applied.resolvedValue === 'string' ? String(applied.resolvedValue) : null;
            const chosen: string = applied && typeof applied.chosen === 'string' ? String(applied.chosen) : '';
            if (resolved === null) {
              results.push({ stepId: sid, name, ok: false, reason: 'element_not_found', message: 'select_option_not_found' });
              continue;
            }
            // Readback verification with one bounded re-apply, mirroring
            // type/fill: the read settles first so async framework reverts
            // land before the comparison. Only booleans and lengths are
            // recorded — never the option values.
            const readEval = buildSelectReadEval(x, y);
            const readSelectValue = async (): Promise<string | null> => {
              try {
                const cur: any = await page.evaluate(readEval);
                return cur && typeof cur.value === 'string' ? String(cur.value) : null;
              } catch {
                return null;
              }
            };
            const check = await ensureTypedValue(
              {
                read: async () => {
                  await page.waitForTimeout(250);
                  return readSelectValue();
                },
                clearAndSet: async () => {
                  const again: any = await page.evaluate(setEval);
                  if (!again || typeof again.resolvedValue !== 'string') throw new Error('select target not found on repair');
                },
              },
              resolved,
            );
            const shortChosen = chosen.slice(0, 80);
            if (!check.readOk) {
              const data = { chosen: shortChosen, verified: false };
              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data });
              results.push({ stepId: sid, name, ok: true, message: shortChosen, verified: false });
              try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
              continue;
            }
            if (!check.match) {
              const detail = `value_mismatch expected_len=${check.expectedLength} observed_len=${check.observedLength}${check.repaired ? ' repaired_once' : ''}`;
              broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'value_not_applied', message: detail });
              results.push({ stepId: sid, name, ok: false, reason: 'value_not_applied', message: detail, verified: true, valueMatch: false, repaired: check.repaired });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason: 'value_not_applied', error: detail });
              } catch { }
              continue;
            }
            const data = { chosen: shortChosen, verified: true, valueMatch: true, repaired: check.repaired };
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data });
            results.push({ stepId: sid, name, ok: true, message: shortChosen, verified: true, valueMatch: true, repaired: check.repaired });
            try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
            continue;
          } catch (e: any) {
            const msg = String(e?.message || e);
            const reason: FailureReason = classifyActionError(e);
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason, message: msg });
            results.push({ stepId: sid, name, ok: false, reason, message: msg });
            try {
              broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason, error: msg });
            } catch { }
            continue;
          }
        }

        if (name === 'thought') {
          const text = String(a?.text || '').trim();
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { thought: text } });
          results.push({ stepId: sid, name: 'thought', ok: true, message: text.slice(0, 200) });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: `unsupported_action: ${name}` });
        broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'unknown', message: `unsupported_action: ${name}` });
        try {
          broadcastBrowserEvent(sessionId, {
            type: 'action_error',
            ts: now(),
            actionId: sid,
            actionType: name,
            reason: 'unknown',
            error: `unsupported_action: ${name}`,
          });
        } catch { }
      } catch (e: any) {
        const msg = String(e?.message || e);
        const reason: FailureReason = classifyActionError(e);
        results.push({ stepId: sid, name, ok: false, reason, message: msg });
        broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason, message: msg });
        try {
          broadcastBrowserEvent(sessionId, {
            type: 'action_error',
            ts: now(),
            actionId: sid,
            actionType: name,
            reason,
            error: msg,
          });
        } catch { }
        setStreamMask(sessionId, []);
        break; // fail_fast = true
      }
    }

    const ok = results.every((r) => r.ok);
    const summary = ok ? 'تم تنفيذ المهمة بنجاح.' : 'فشل تنفيذ بعض الخطوات.';
    if (emitFinalReport) {
      broadcastBrowserEvent(sessionId, {
        type: 'final_report',
        ts: now(),
        ok,
        summary,
        steps: results,
        evidence,
      });
      if (ok) {
        broadcastBrowserEvent(sessionId, { type: 'final_success', ts: now(), summary });
      } else {
        broadcastBrowserEvent(sessionId, { type: 'final_failed', ts: now(), summary, reason: 'some_steps_failed' });
      }
      try {
        broadcastBrowserEvent(sessionId, { type: 'session_status', ts: now(), sessionId, url: page.url(), workerStatus: 'idle' });
      } catch { }
    }

    touchSession(sessionId);
    return { ok, summary, steps: results, evidence };
  });
}
