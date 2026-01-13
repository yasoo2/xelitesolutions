import type { Locator, Page } from 'playwright';
import type { FailureReason } from './types';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';
import { getBrowserSession, setStreamMask, startStreaming, touchSession, withBrowserConcurrency } from './manager';
import { getUserSecret } from '../services/secrets';

type Action =
  | { type: 'goto'; url: string }
  | { type: 'click'; selector?: string; role?: string; name?: string; text?: string }
  | { type: 'type'; selector?: string; role?: string; name?: string; text: string }
  | { type: 'scroll'; direction: 'down' | 'up'; amount?: number }
  | { type: 'wait'; ms: number }
  | { type: 'assert'; selector?: string; text?: string }
  | { type: 'ui_audit' };

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

async function boxFor(locator: Locator) {
  try {
    await locator.first().scrollIntoViewIfNeeded();
  } catch {}
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
  ];
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      await loc.click({ timeout: 1500 });
      await page.waitForTimeout(250);
    } catch {}
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
}) {
  return await withBrowserConcurrency(async () => {
    const userId = String(params.userId || '').trim();
    const sessionId = String(params.sessionId || '').trim();
    const actions = Array.isArray(params.actions) ? params.actions : [];
    const cfg = DEFAULT_BROWSER_CONFIG;

    const s = await getBrowserSession(sessionId);
    startStreaming(sessionId);

    const page = s.page;
    try {
      broadcastBrowserEvent(sessionId, {
        type: 'session_status',
        ts: now(),
        sessionId,
        url: page.url(),
        workerStatus: 'running',
      });
    } catch {}
    const results: Array<{ stepId: string; name: string; ok: boolean; reason?: FailureReason; message?: string }> = [];
    const evidence: Array<{ kind: 'screenshot'; jpegBase64: string; ts: number; stepId: string }> = [];

    for (let i = 0; i < Math.min(cfg.maxSteps, actions.length); i += 1) {
      touchSession(sessionId);
      const a: any = actions[i];
      const name = String(a?.type || 'unknown');
      const sid = stepId(i);
      try {
        const rawText = name === 'type' ? String(a?.text || '') : '';
        const secretMatch = name === 'type' ? rawText.match(SECRET_TOKEN_RE) : null;
        const summary =
          name === 'goto'
            ? `goto ${String(a?.url || '').trim()}`
            : name === 'type'
              ? secretMatch
                ? `type (secret:${String(secretMatch[1] || '').trim() || 'KEY'})`
                : `type (len=${rawText.length})`
              : name;
        broadcastBrowserEvent(sessionId, { type: 'action_sent', ts: now(), actionId: sid, actionType: name, summary });
      } catch {}
      broadcastBrowserEvent(sessionId, { type: 'step_start', stepId: sid, name, ts: now() });
      try {
        broadcastBrowserEvent(sessionId, { type: 'action_ack', ts: now(), actionId: sid, actionType: name });
      } catch {}

      let mask: Locator[] = [];
      try {
        if (name === 'goto') {
          const url = String(a?.url || '').trim();
          if (!url) {
            results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: 'missing_url' });
            broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'unknown', message: 'missing_url' });
            continue;
          }
          if (!isSameSiteAllowed(s.allowedOrigin, url)) {
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
            } catch {}
            continue;
          }
          broadcastBrowserEvent(sessionId, { type: 'cursor_move', ts: now(), x: 30, y: 20 });
          broadcastBrowserEvent(sessionId, { type: 'highlight_boxes', ts: now(), boxes: [{ x: 10, y: 8, width: 520, height: 38, label: 'goto' }] });

          setStreamMask(sessionId, []);
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
          await page.waitForTimeout(250);

          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now(), data: { url: page.url() } });
          results.push({ stepId: sid, name, ok: true });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch {}
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
          } catch {}
          continue;
        }

        if (name === 'scroll') {
          const direction = a?.direction === 'up' ? 'up' : 'down';
          const amount = Math.max(120, Math.min(2400, Number(a?.amount || 800)));
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
          await page.mouse.wheel(0, direction === 'down' ? amount : -amount);
          await page.waitForTimeout(250);
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch {}
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
          } catch {}
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
          } catch {}
          continue;
        }

        if (name === 'click' || name === 'type') {
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
              } catch {}

              setStreamMask(sessionId, []);
              const before = await screenshotJpegBase64(page);
              evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

              await page.mouse.click(x, y);

              await page.waitForTimeout(120);
              const after = await screenshotJpegBase64(page);
              evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

              broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
              results.push({ stepId: sid, name, ok: true });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
              } catch {}
              continue;
            }
          }

          if (name === 'type') {
            const textRaw = String(a?.text || '');
            if (textRaw && !a?.selector && !a?.role && !a?.name && !a?.textTarget) {
              const secretMatch = textRaw.match(SECRET_TOKEN_RE);
              if (!secretMatch) {
                setStreamMask(sessionId, []);
                const before = await screenshotJpegBase64(page);
                evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

                await page.keyboard.type(textRaw, { delay: 10 });

                await page.waitForTimeout(80);
                const after = await screenshotJpegBase64(page);
                evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

                broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
                results.push({ stepId: sid, name, ok: true });
                try {
                  broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
                } catch {}
                continue;
              }
            }
          }

          const loc = locatorForAction(page, a);
          if (!loc) {
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
            } catch {}
            continue;
          }

          const count = await loc.count().catch(() => 0);
          if (!count) {
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
            } catch {}
            continue;
          }

          const b = await boxFor(loc);
          if (b) {
            const cx = Math.round(b.x + b.width / 2);
            const cy = Math.round(b.y + b.height / 2);
            broadcastBrowserEvent(sessionId, { type: 'cursor_move', ts: now(), x: cx, y: cy });
            broadcastBrowserEvent(sessionId, { type: 'highlight_boxes', ts: now(), boxes: [{ ...b, label: name }] });
          }

          const textRaw = name === 'type' ? String(a?.text || '') : '';
          const secretMatch = name === 'type' ? textRaw.match(SECRET_TOKEN_RE) : null;
          if (secretMatch) {
            const secretKey = String(secretMatch[1] || '').trim();
            const secretValue = (await getUserSecret(userId, 'internal', secretKey)) || '';
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
              } catch {}
              continue;
            }
            mask = [loc.first()];
            setStreamMask(sessionId, mask);
            const before = await screenshotJpegBase64(page, mask);
            evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });
            await loc.first().click({ timeout: cfg.actionTimeoutMs });
            await loc.first().fill(secretValue, { timeout: cfg.actionTimeoutMs });
            const after = await screenshotJpegBase64(page, mask);
            evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });
            setStreamMask(sessionId, []);
            broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
            results.push({ stepId: sid, name, ok: true });
            try {
              broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
            } catch {}
            continue;
          }

          setStreamMask(sessionId, []);
          const before = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: before, ts: now(), stepId: sid });

          try {
            if (name === 'click') {
              await loc.first().click({ timeout: cfg.actionTimeoutMs });
            } else {
              await loc.first().click({ timeout: cfg.actionTimeoutMs });
              await loc.first().fill(textRaw, { timeout: cfg.actionTimeoutMs });
            }
          } catch (e: any) {
            await tryDismissOverlays(page);
            try {
              if (name === 'click') {
                await loc.first().click({ timeout: cfg.actionTimeoutMs });
              } else {
                await loc.first().click({ timeout: cfg.actionTimeoutMs });
                await loc.first().fill(textRaw, { timeout: cfg.actionTimeoutMs });
              }
            } catch (e2: any) {
              const msg = String(e2?.message || e2);
              const reason: FailureReason = /timeout/i.test(msg) ? 'timeout' : /overlay|intercept|not clickable/i.test(msg) ? 'overlay_blocking_click' : 'unknown';
              broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason, message: msg });
              results.push({ stepId: sid, name, ok: false, reason, message: msg });
              try {
                broadcastBrowserEvent(sessionId, { type: 'action_error', ts: now(), actionId: sid, actionType: name, reason, error: msg });
              } catch {}
              continue;
            }
          }

          await page.waitForTimeout(250);
          const after = await screenshotJpegBase64(page);
          evidence.push({ kind: 'screenshot', jpegBase64: after, ts: now(), stepId: sid });

          if (cfg.strictSameSite && s.allowedOrigin) {
            const cur = page.url();
            try {
              const u = new URL(cur);
              if (u.origin !== s.allowedOrigin) {
                broadcastBrowserEvent(sessionId, { type: 'goto_blocked', stepId: sid, ts: now(), url: cur, reason: 'same_site_blocked', message: 'cross_site_blocked' });
                try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs }); } catch {}
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
                } catch {}
                continue;
              }
            } catch {}
          }

          broadcastBrowserEvent(sessionId, { type: 'step_done', stepId: sid, name, ts: now() });
          results.push({ stepId: sid, name, ok: true });
          try {
            broadcastBrowserEvent(sessionId, { type: 'action_done', ts: now(), actionId: sid, actionType: name });
          } catch {}
          continue;
        }

        results.push({ stepId: sid, name, ok: false, reason: 'unknown', message: 'unsupported_action' });
        broadcastBrowserEvent(sessionId, { type: 'step_error', stepId: sid, name, ts: now(), reason: 'unknown', message: 'unsupported_action' });
        try {
          broadcastBrowserEvent(sessionId, {
            type: 'action_error',
            ts: now(),
            actionId: sid,
            actionType: name,
            reason: 'unknown',
            error: 'unsupported_action',
          });
        } catch {}
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
        } catch {}
        setStreamMask(sessionId, []);
      }
    }

    const ok = results.every((r) => r.ok);
    const summary = ok ? 'تم تنفيذ المهمة بنجاح.' : 'فشل تنفيذ بعض الخطوات.';
    broadcastBrowserEvent(sessionId, {
      type: 'final_report',
      ts: now(),
      ok,
      summary,
      steps: results,
      evidence,
    });
    try {
      broadcastBrowserEvent(sessionId, { type: 'session_status', ts: now(), sessionId, url: page.url(), workerStatus: 'idle' });
    } catch {}

    touchSession(sessionId);
    return { ok, summary, steps: results, evidence };
  });
}
