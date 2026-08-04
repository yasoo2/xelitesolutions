import type { Locator, Page } from 'playwright';
import type { FailureReason } from './types';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';
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
    const results: Array<{ stepId: string; name: string; ok: boolean; reason?: FailureReason; message?: string }> = [];
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

          let navigated = false;
          let lastErr = '';
          for (const u of gotoCandidates) {
            try {
              await page.goto(u, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
              navigated = true;
              break;
            } catch (e: any) {
              lastErr = String(e?.message || e || '');
            }
          }
          if (!navigated) {
            const msg = lastErr.trim() || 'navigation_failed';
            const reason = navReason(msg);
            results.push({ stepId: sid, name, ok: false, reason, message: msg.slice(0, 600) });
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason, message: msg.slice(0, 600) });
            try {
              broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason, error: msg.slice(0, 600) });
            } catch { }
            continue;
          }
          await page.waitForTimeout(250);

          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { url: page.url() } });
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
          await page.waitForTimeout(ms);
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
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
          try {
            const vp = page.viewportSize();
            if (vp) {
              const currentX = (interactions as any).lastMousePosition.x || 0;
              const currentY = (interactions as any).lastMousePosition.y || 0;
              await interactions.naturalMouseMove(page, currentX, currentY, vp.width / 2, vp.height / 2, 200);
            }
          } catch { }

          await page.mouse.wheel(0, direction === 'down' ? amount : -amount);
          await page.waitForTimeout(250);
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'hover') {
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
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
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
          const selector = typeof a?.selector === 'string' ? a.selector : '';
          const text = typeof a?.text === 'string' ? a.text : '';
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          if (selector) {
            const loc = page.locator(selector).first();
            await loc.waitFor({ state: 'visible', timeout: cfg.actionTimeoutMs });
          } else if (text) {
            const loc = page.getByText(text, { exact: false }).first();
            await loc.waitFor({ state: 'visible', timeout: cfg.actionTimeoutMs });
          } else {
            throw new Error('assert_missing_target');
          }
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'key') {
          const key = String(a?.key || '');
          if (key) {
            await page.keyboard.press(key);
            await page.waitForTimeout(100);
            const after = await screenshotJpegBase64(page);
            evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
            results.push({ stepId: sid, name, ok: true });
            try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
            continue;
          }
        }

        if (name === 'evaluate') {
          const script = String(a?.script || '');
          if (script) {
            const res = await page.evaluate(script);
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { result: String(res) } });
            results.push({ stepId: sid, name, ok: true });
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

              await interactions.naturalClick(page, 'click', x, y);

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

          const textRaw = name === 'type' ? String(a?.text || '') : '';
          const secretMatch = name === 'type' ? textRaw.match(SECRET_TOKEN_RE) : null;
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
            name === 'type' &&
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
                await loc.first().fill(textRaw);
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
                  await loc.first().fill(textRaw);
                }
              }
            } catch (e2: any) {
              const msg = String(e2?.message || e2);
              const reason: FailureReason = /timeout/i.test(msg) ? 'timeout' : /overlay|intercept|not clickable/i.test(msg) ? 'overlay_blocking_click' : 'unknown';
              broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason, message: msg });
              results.push({ stepId: sid, name, ok: false, reason, message: msg });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason, error: msg });
              } catch { }
              if (isSensitiveType) setStreamMask(sessionId, []);
              continue;
            }
          }

          await page.waitForTimeout(250);
          const after = await screenshotJpegBase64(page, isSensitiveType ? mask : undefined);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          if (isSensitiveType) setStreamMask(sessionId, []);

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

          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch { }
          continue;
        }

        if (name === 'back') {
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs }).catch(() => null);
          await page.waitForTimeout(250);
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'forward') {
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          await page.goForward({ waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs }).catch(() => null);
          await page.waitForTimeout(250);
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'reload') {
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          await page.reload({ waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs }).catch(() => null);
          await page.waitForTimeout(250);
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'screenshot') {
          const current = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: current, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'extract_text') {
          const selector = String(a?.selector || '').trim();
          let resultText = '';
          if (selector) {
            resultText = await page.evaluate((sel: string) => {
              const el = document.querySelector(sel);
              return el ? (el.textContent || '').trim() : 'Element not found';
            }, selector);
          } else {
            resultText = await page.evaluate(() => (document.body.innerText || '').substring(0, 10000));
          }
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { text: resultText } });
          results.push({ stepId: sid, name, ok: true, message: resultText.slice(0, 200) });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'get_elements') {
          const elements = await page.evaluate(() => {
            const interactiveSelectors = 'a, button, input, select, textarea, [role=button], [onclick], [tabindex]';
            const els = Array.from(document.querySelectorAll(interactiveSelectors));
            return els.slice(0, 100).map((el, i) => {
              const rect = el.getBoundingClientRect();
              return {
                index: i,
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || '').trim().substring(0, 100),
                type: (el as any).type || undefined,
                x: Math.round(rect.x + rect.width / 2),
                y: Math.round(rect.y + rect.height / 2),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                visible: rect.width > 0 && rect.height > 0
              };
            }).filter(e => e.visible);
          });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { elements } });
          results.push({ stepId: sid, name, ok: true });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'scroll_to_element') {
          const selector = String(a?.selector || '').trim();
          if (!selector) {
            results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: 'missing_selector' });
            continue;
          }
          await page.evaluate((sel: string) => {
            const el = document.querySelector(sel);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, selector);
          await page.waitForTimeout(500);
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
          continue;
        }

        if (name === 'click_coordinates') {
          const x = Number(a?.x);
          const y = Number(a?.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            await interactions.naturalClick(page, 'coord_click', x, y);
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
            results.push({ stepId: sid, name, ok: true });
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
            const chosen = await page.evaluate((arg: { x: number; y: number; value: string }) => {
              const at = document.elementFromPoint(arg.x, arg.y) as any;
              const sel = (at && (at.tagName === 'SELECT' ? at : at.closest && at.closest('select'))) as HTMLSelectElement | null;
              if (!sel) return null;
              const norm = (s: any) => String(s || '').trim().toLowerCase();
              const opts = Array.from(sel.options);
              let opt = opts.find(o => norm(o.value) === norm(arg.value) || norm(o.textContent) === norm(arg.value))
                || opts.find(o => norm(o.textContent).includes(norm(arg.value)) || norm(o.value).includes(norm(arg.value)));
              if (!opt) return null;
              sel.value = opt.value;
              sel.dispatchEvent(new Event('input', { bubbles: true }));
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              return opt.textContent || opt.value;
            }, { x, y, value });
            if (chosen == null) {
              results.push({ stepId: sid, name, ok: false, reason: 'element_not_found', message: 'select_option_not_found' });
              continue;
            }
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { chosen } });
            results.push({ stepId: sid, name, ok: true, message: String(chosen).slice(0, 80) });
            try { broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name }); } catch { }
            continue;
          } catch {
            results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: 'select_failed' });
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
        const reason: FailureReason = /timeout/i.test(msg) ? 'timeout' : 'unknown';
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
